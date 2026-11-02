import type { TtsBackend } from '../player.js';
import { createWebAudioOutput, type AudioOutput } from './audio.js';
import { lengthScaleForRate, splitSentences } from './config.js';
import type { PiperAudio, PiperEngine, PiperEngineFactory, PiperVoiceSpec } from './engine.js';

export type PiperEvent =
  | { type: 'ready'; voice: string; loadMs: number }
  | { type: 'synth'; voice: string; chars: number; ms: number; audioSeconds: number; cached: false }
  | { type: 'fallback'; reason: 'no-voice' | 'load-error' | 'load-slow' | 'first-synthesis-slow' | 'synthesis-error' | 'audio-error' | 'disabled'; voice?: string; detail?: string };

export interface PiperTtsOptions {
  engines: PiperEngineFactory;
  /** The Piper voice that speaks this BCP 47 tag, or null when no pack offers one (then the fallback speaks). */
  resolveVoice: (bcp47: string) => PiperVoiceSpec | null | Promise<PiperVoiceSpec | null>;
  /** The phone's own TTS. Used whenever Piper cannot speak: the listener is never left in silence. */
  fallback: TtsBackend;
  output?: AudioOutput;
  /** The first synthesis of the session must finish within this, or Piper is switched off for the session. Default 6000. */
  firstSynthesisMs?: number;
  /** How long one utterance waits for a model that is still loading before the fallback speaks it. Default 6000. */
  loadGraceMs?: number;
  /** In-memory audio cache for "Again": total bytes of PCM kept. Default 32 MB. */
  maxCacheBytes?: number;
  /** How many models stay loaded at once (RAM). Default 2. */
  maxLoadedVoices?: number;
  onEvent?: (e: PiperEvent) => void;
  now?: () => number;
}

export interface PiperTts extends TtsBackend {
  /** Starts loading the voice for this language in the background. Resolves true when it is ready. */
  warm(bcp47: string): Promise<boolean>;
  /** True after a slow first synthesis or an audio failure: Piper stays off until the app restarts. */
  readonly disabled: boolean;
  /** Drops cached audio and loaded models. */
  dispose(): void;
}

interface Entry {
  voice: PiperVoiceSpec;
  engine: PiperEngine;
  loaded: Promise<void>;
  ready: boolean;
  broken: boolean;
  verified: boolean;
  used: number;
}

const wait = (ms: number): Promise<'timeout'> => new Promise((r) => setTimeout(() => r('timeout'), ms));

export function createPiperTts(opts: PiperTtsOptions): PiperTts {
  const output = opts.output ?? createWebAudioOutput();
  const firstSynthesisMs = opts.firstSynthesisMs ?? 6000;
  const loadGraceMs = opts.loadGraceMs ?? 6000;
  const maxBytes = opts.maxCacheBytes ?? 32 * 1024 * 1024;
  const maxLoaded = Math.max(opts.maxLoadedVoices ?? 2, 1);
  const now = opts.now ?? (() => Date.now());
  const emit = (e: PiperEvent): void => {
    try {
      opts.onEvent?.(e);
    } catch {
      /* diagnostics must not break speech */
    }
  };

  const entries = new Map<string, Entry>();
  let disabled = false;
  let token = 0;
  let clock = 0;
  let playing: { stop(): void } | null = null;

  // --- cache of synthesized sentences (for "Again") ---
  const cache = new Map<string, PiperAudio>();
  let cacheBytes = 0;
  const inflight = new Map<string, Promise<PiperAudio>>();
  const cacheGet = (k: string): PiperAudio | undefined => {
    const hit = cache.get(k);
    if (hit) {
      cache.delete(k); // refresh: Map keeps insertion order, oldest first
      cache.set(k, hit);
    }
    return hit;
  };
  const cachePut = (k: string, a: PiperAudio): void => {
    if (a.samples.byteLength > maxBytes) return;
    const old = cache.get(k);
    if (old) cacheBytes -= old.samples.byteLength;
    cache.set(k, a);
    cacheBytes += a.samples.byteLength;
    for (const [key, v] of cache) {
      if (cacheBytes <= maxBytes) break;
      if (key === k) continue;
      cache.delete(key);
      cacheBytes -= v.samples.byteLength;
    }
  };

  function drop(entry: Entry): void {
    entries.delete(entry.voice.id);
    try {
      entry.engine.dispose();
    } catch {
      /* already gone */
    }
  }

  function entryFor(voice: PiperVoiceSpec): Entry {
    let e = entries.get(voice.id);
    if (!e) {
      while ([...entries.values()].filter((x) => !x.broken).length >= maxLoaded) {
        const lru = [...entries.values()].sort((a, b) => a.used - b.used)[0];
        if (!lru) break;
        drop(lru);
      }
      const engine = opts.engines(voice);
      const t0 = now();
      const entry: Entry = { voice, engine, loaded: Promise.resolve(), ready: false, broken: false, verified: false, used: ++clock };
      entry.loaded = engine.load().then(
        () => {
          entry.ready = true;
          emit({ type: 'ready', voice: voice.id, loadMs: now() - t0 });
        },
        (err) => {
          entry.broken = true;
          throw err;
        },
      );
      entry.loaded.catch(() => undefined); // reported by whoever awaits it
      entries.set(voice.id, entry);
      e = entry;
    }
    e.used = ++clock;
    return e;
  }

  function synth(entry: Entry, sentence: string, scale: number): Promise<PiperAudio> {
    const key = `${entry.voice.id}|${scale}|${sentence}`;
    const hit = cacheGet(key);
    if (hit) return Promise.resolve(hit);
    let p = inflight.get(key);
    if (!p) {
      const t0 = now();
      p = entry.engine.synthesize(sentence, { lengthScale: scale }).then((a) => {
        cachePut(key, a);
        emit({ type: 'synth', voice: entry.voice.id, chars: sentence.length, ms: now() - t0, audioSeconds: a.samples.length / a.sampleRate, cached: false });
        return a;
      });
      inflight.set(key, p);
      const clear = (): void => void inflight.delete(key);
      p.then(clear, clear);
    }
    return p;
  }

  const useFallback = (reason: Extract<PiperEvent, { type: 'fallback' }>['reason'], req: Parameters<TtsBackend['speak']>[0], voice?: string, detail?: string): Promise<void> => {
    emit({ type: 'fallback', reason, ...(voice ? { voice } : {}), ...(detail ? { detail } : {}) });
    return opts.fallback.speak(req);
  };

  const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  return {
    get disabled() {
      return disabled;
    },

    async warm(bcp47) {
      if (disabled) return false;
      try {
        const voice = await opts.resolveVoice(bcp47);
        if (!voice) return false;
        const e = entryFor(voice);
        await e.loaded;
        return true;
      } catch {
        return false;
      }
    },

    async speak(req) {
      const my = ++token;
      const { text, bcp47, rate, onProgress } = req;
      if (disabled) return useFallback('disabled', req);
      let voice: PiperVoiceSpec | null;
      try {
        voice = await opts.resolveVoice(bcp47);
      } catch {
        voice = null;
      }
      if (my !== token) return;
      if (!voice) return useFallback('no-voice', req);
      const entry = entryFor(voice);
      if (entry.broken) return useFallback('load-error', req, voice.id);

      if (!entry.ready) {
        const r = await Promise.race([entry.loaded.then(() => 'ok' as const, (e: unknown) => ({ error: e })), wait(loadGraceMs)]);
        if (my !== token) return;
        if (r === 'timeout') return useFallback('load-slow', req, voice.id); // keeps loading: the next utterance may use it
        if (r !== 'ok') {
          drop(entry);
          return useFallback('load-error', req, voice.id, errText(r.error));
        }
      }

      const sentences = splitSentences(text);
      if (sentences.length === 0) return;
      const scale = lengthScaleForRate(rate);
      const weight = sentences.reduce((n, s) => n + s.length, 0) || 1;
      let doneChars = 0;

      // Start the first sentence; the very first synthesis of the session is timed.
      let current: Promise<PiperAudio> = synth(entry, sentences[0]!, scale);
      current.catch(() => undefined);
      if (!entry.verified) {
        const first = await Promise.race([current.then((a) => a, (e: unknown) => ({ error: e })), wait(firstSynthesisMs)]);
        if (my !== token) return;
        if (first === 'timeout') {
          disabled = true;
          for (const e of [...entries.values()]) drop(e); // frees the worker; the stuck call dies with it
          return useFallback('first-synthesis-slow', req, voice.id);
        }
        if ('error' in first && !('samples' in first)) {
          drop(entry);
          return useFallback('synthesis-error', req, voice.id, errText(first.error));
        }
        entry.verified = true;
      }

      for (let i = 0; i < sentences.length; i++) {
        if (my !== token) return;
        let audio: PiperAudio;
        try {
          audio = await current;
        } catch (e) {
          if (my !== token) return;
          const rest = sentences.slice(i).join(' ');
          return useFallback('synthesis-error', { ...req, text: rest, onProgress: (f) => onProgress?.((doneChars + f * (weight - doneChars)) / weight) }, voice.id, errText(e));
        }
        if (my !== token) return;
        if (i + 1 < sentences.length) {
          current = synth(entry, sentences[i + 1]!, scale); // synthesize the next sentence while this one plays
          current.catch(() => undefined);
        }
        const len = sentences[i]!.length;
        try {
          const h = output.play(audio, (f) => {
            if (my === token) onProgress?.((doneChars + Math.min(Math.max(f, 0), 1) * len) / weight);
          });
          playing = h;
          await h.done;
        } catch (e) {
          if (my !== token) return;
          disabled = true;
          const rest = sentences.slice(i).join(' ');
          return useFallback('audio-error', { ...req, text: rest, onProgress: (f) => onProgress?.((doneChars + f * (weight - doneChars)) / weight) }, voice.id, errText(e));
        } finally {
          playing = null;
        }
        doneChars += len;
        if (my === token) onProgress?.(doneChars / weight);
      }
    },

    cancel() {
      token++;
      playing?.stop();
      playing = null;
      opts.fallback.cancel();
    },

    dispose() {
      token++;
      playing?.stop();
      cache.clear();
      cacheBytes = 0;
      for (const e of [...entries.values()]) drop(e);
      output.close?.();
    },
  };
}
