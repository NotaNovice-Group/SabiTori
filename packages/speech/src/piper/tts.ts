import type { TtsBackend } from '../player.js';
import { createWebAudioOutput, type AudioOutput } from './audio.js';
import { lengthScaleForRate, splitSentences } from './config.js';
import { voiceKey, type PiperAudio, type PiperEngine, type PiperVoiceSpec } from './engine.js';

export type PiperEvent =
  | { type: 'ready'; voice: string; loadMs: number }
  | { type: 'synth'; voice: string; chars: number; ms: number; audioSeconds: number; cached: false }
  | { type: 'fallback'; reason: 'no-voice' | 'load-error' | 'load-slow' | 'first-synthesis-slow' | 'synthesis-error' | 'audio-error' | 'disabled'; voice?: string; detail?: string };

export interface PiperTtsOptions<V extends PiperVoiceSpec = PiperVoiceSpec> {
  engines: (voice: V) => PiperEngine;
  /**
   * The Piper voice that speaks this BCP 47 tag, or null when no pack offers one (then the fallback speaks).
   * `ref` is the pack tag and voice id the rendered part carries: two packs sharing a BCP 47 tag get their own voices.
   */
  resolveVoice: (bcp47: string, ref?: { tag?: string; voice?: string }) => V | null | Promise<V | null>;
  /**
   * The phone's own TTS. Used whenever Piper cannot speak: the listener is never left in silence. When the phone
   * has no voice for the language either, this backend (createBrowserTts) rejects with TtsVoiceUnavailableError;
   * that rejection is passed on to the player's onError so the app can render the next fallback language.
   */
  fallback: TtsBackend;
  output?: AudioOutput;
  /**
   * The first synthesis of a voice must finish within this, or that voice is switched off for the session. Default 6000.
   * A function gets the first piece of text and the rate (a longer piece may get more time).
   */
  firstSynthesisMs?: number | ((text: string, rate: number) => number);
  /**
   * Judges the first synthesis that did finish in time: false switches the voice off for the session like a timeout
   * ('first-synthesis-slow'; `why` goes into the event's detail). Default: always fast enough.
   */
  acceptFirstSynthesis?: (m: { ms: number; audioSeconds: number }) => { ok: true } | { ok: false; why: string };
  /** A voice too slow for the phone switches off EVERY voice of this backend (they share one model). Default false. */
  slowMeansAllSlow?: boolean;
  /** Cuts the text into synthesis pieces (the first plays while the next is made). Default splitSentences. */
  split?: (text: string) => string[];
  /**
   * A short text that warm() synthesizes once after loading a voice, as a speed test judged like a first synthesis
   * (firstSynthesisMs, acceptFirstSynthesis), before anyone listens: a phone that is too slow is found out in the
   * background and the fallback is ready for the first tap. Null or absent: no speed test.
   */
  probe?: (voice: V) => string | null;
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
  /** Starts loading the voice for this language (or this pack's voice) in the background. Resolves true when it is ready. */
  warm(bcp47: string, ref?: { tag?: string; voice?: string }): Promise<boolean>;
  /** True after an audio output failure: Piper stays off for every voice until the app restarts. */
  readonly disabled: boolean;
  /** Voices (id@version) switched off for the session: a slow first synthesis, or a model that does not match its config. Other voices keep working. */
  readonly disabledVoices: ReadonlySet<string>;
  /** With slowMeansAllSlow: why the backend is off for the session (too slow on this phone), else null. */
  readonly tooSlow: string | null;
  /** Drops cached audio and loaded models. */
  dispose(): void;
}

interface Entry<V extends PiperVoiceSpec = PiperVoiceSpec> {
  voice: V;
  engine: PiperEngine;
  loaded: Promise<void>;
  ready: boolean;
  broken: boolean;
  verified: boolean;
  /** The background speed test (opts.probe) while it runs: resolves true when the voice is fast enough. */
  probing?: Promise<boolean>;
  used: number;
}

const wait = (ms: number): Promise<'timeout'> => new Promise((r) => setTimeout(() => r('timeout'), ms));

export function createPiperTts<V extends PiperVoiceSpec = PiperVoiceSpec>(opts: PiperTtsOptions<V>): PiperTts {
  const output = opts.output ?? createWebAudioOutput();
  const firstSynthesisBudget = (text: string, rate: number): number => {
    const f = opts.firstSynthesisMs ?? 6000;
    return typeof f === 'function' ? f(text, rate) : f;
  };
  const split = opts.split ?? ((t: string) => splitSentences(t));
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

  const entries = new Map<string, Entry<V>>();
  let disabled = false;
  /** slowMeansAllSlow: the backend was too slow on this phone; every voice stays off for the session. */
  let tooSlow: string | null = null;
  /** Voices (by key) that must not be used again this session: slow, or broken. A broken voice is not reloaded for every utterance. */
  const off = new Set<string>();
  const brokenWhy = new Map<string, string>();
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

  function drop(entry: Entry<V>): void {
    entries.delete(voiceKey(entry.voice));
    try {
      entry.engine.dispose();
    } catch {
      /* already gone */
    }
  }

  function startLoad(entry: Entry<V>): void {
    const t0 = now();
    entry.ready = false;
    entry.loaded = entry.engine.load().then(
      () => {
        entry.ready = true;
        emit({ type: 'ready', voice: entry.voice.id, loadMs: now() - t0 });
      },
      (err) => {
        entry.broken = true;
        throw err;
      },
    );
    entry.loaded.catch(() => undefined); // reported by whoever awaits it
  }

  function entryFor(voice: V): Entry<V> {
    const key = voiceKey(voice);
    let e = entries.get(key);
    if (!e) {
      while ([...entries.values()].filter((x) => !x.broken).length >= maxLoaded) {
        const lru = [...entries.values()].sort((a, b) => a.used - b.used)[0];
        if (!lru) break;
        drop(lru);
      }
      const entry: Entry<V> = { voice, engine: opts.engines(voice), loaded: Promise.resolve(), ready: false, broken: false, verified: false, used: ++clock };
      startLoad(entry);
      entries.set(key, entry);
      e = entry;
    }
    e.used = ++clock;
    return e;
  }

  /** The worker that held the model was restarted: forget that the voice is ready and load it again. */
  function revive(entry: Entry<V>): void {
    if (entry.ready && entry.engine.alive && !entry.engine.alive()) startLoad(entry);
  }

  const markBroken = (voice: V, why: string): void => {
    off.add(voiceKey(voice));
    brokenWhy.set(voiceKey(voice), why);
  };

  function synth(entry: Entry<V>, sentence: string, scale: number): Promise<PiperAudio> {
    const key = `${voiceKey(entry.voice)}|${scale}|${sentence}`;
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

  /** The voice is too slow for this phone: off for the session (with slowMeansAllSlow: every voice), worker freed. */
  const markSlow = (voice: V, why: string): void => {
    off.add(voiceKey(voice));
    if (opts.slowMeansAllSlow) tooSlow = why;
    for (const e of [...entries.values()]) drop(e); // frees the worker; the stuck call dies with it
  };

  /** Runs opts.probe once for a loaded voice. Never rejects. */
  function speedTest(entry: Entry<V>): Promise<boolean> {
    const text = opts.probe?.(entry.voice);
    if (!text || entry.verified) return Promise.resolve(true);
    entry.probing ??= (async () => {
      const budget = firstSynthesisBudget(text, 1);
      const t0 = now();
      const p = synth(entry, text, 1);
      p.catch(() => undefined);
      const r = await Promise.race([p.then((a) => a, (e: unknown) => ({ error: e })), wait(budget)]);
      if (entry.verified) return true; // a speak() judged it meanwhile
      const slow = (why: string): boolean => {
        markSlow(entry.voice, why);
        emit({ type: 'fallback', reason: 'first-synthesis-slow', voice: entry.voice.id, detail: `speed test: ${why}` });
        return false;
      };
      if (r === 'timeout') return slow(`not ready after ${budget} ms`);
      if (!('samples' in r)) {
        drop(entry);
        markBroken(entry.voice, errText(r.error));
        emit({ type: 'fallback', reason: 'synthesis-error', voice: entry.voice.id, detail: `speed test: ${errText(r.error)}` });
        return false;
      }
      const verdict = opts.acceptFirstSynthesis?.({ ms: now() - t0, audioSeconds: r.samples.length / r.sampleRate }) ?? { ok: true as const };
      if (!verdict.ok) return slow(verdict.why);
      entry.verified = true;
      return true;
    })().finally(() => {
      entry.probing = undefined;
    });
    return entry.probing;
  }

  return {
    get disabled() {
      return disabled;
    },
    get disabledVoices() {
      return off;
    },
    get tooSlow() {
      return tooSlow;
    },

    async warm(bcp47, ref) {
      if (disabled || tooSlow) return false;
      try {
        const voice = await opts.resolveVoice(bcp47, ref);
        if (!voice || off.has(voiceKey(voice))) return false;
        const e = entryFor(voice);
        revive(e);
        await e.loaded;
        return await speedTest(e);
      } catch {
        return false;
      }
    },

    async speak(req) {
      const my = ++token;
      const { text, bcp47, rate, onProgress } = req;
      if (disabled) return useFallback('disabled', req);
      if (tooSlow) return useFallback('disabled', req, undefined, tooSlow);
      let voice: V | null;
      try {
        voice = await opts.resolveVoice(bcp47, { ...(req.tag ? { tag: req.tag } : {}), ...(req.voice ? { voice: req.voice } : {}) });
      } catch {
        voice = null;
      }
      if (my !== token) return;
      if (!voice) return useFallback('no-voice', req);
      const vkey = voiceKey(voice);
      // A voice that failed to load or does not match its config is not loaded again for every sentence.
      if (brokenWhy.has(vkey)) return useFallback('load-error', req, voice.id, brokenWhy.get(vkey));
      if (off.has(vkey)) return useFallback('disabled', req, voice.id);
      const entry = entryFor(voice);
      if (entry.broken) return useFallback('load-error', req, voice.id);
      revive(entry);

      if (!entry.ready) {
        const r = await Promise.race([entry.loaded.then(() => 'ok' as const, (e: unknown) => ({ error: e })), wait(loadGraceMs)]);
        if (my !== token) return;
        if (r === 'timeout') return useFallback('load-slow', req, voice.id); // keeps loading: the next utterance may use it
        if (r !== 'ok') {
          drop(entry);
          markBroken(voice, errText(r.error));
          return useFallback('load-error', req, voice.id, errText(r.error));
        }
      }

      // The background speed test is still running: its verdict decides (it has its own time limit).
      if (!entry.verified && entry.probing) {
        const fast = await entry.probing;
        if (my !== token) return;
        if (!fast) return useFallback('first-synthesis-slow', req, voice.id, tooSlow ?? brokenWhy.get(vkey) ?? 'speed test failed');
      }

      const sentences = split(text);
      if (sentences.length === 0) return;
      const scale = lengthScaleForRate(rate);
      const weight = sentences.reduce((n, s) => n + s.length, 0) || 1;
      let doneChars = 0;

      // Start the first sentence; the very first synthesis of the session is timed.
      const t0 = now();
      let current: Promise<PiperAudio> = synth(entry, sentences[0]!, scale);
      current.catch(() => undefined);
      if (!entry.verified) {
        const budget = firstSynthesisBudget(sentences[0]!, rate);
        const tooSlowNow = (why: string): Promise<void> => {
          // Only this voice is too slow for the phone: others (and a faster language) keep Piper. Unless all
          // voices share one model (slowMeansAllSlow): then none of them is tried again this session.
          markSlow(voice, why);
          return useFallback('first-synthesis-slow', req, voice.id, why);
        };
        const first = await Promise.race([current.then((a) => a, (e: unknown) => ({ error: e })), wait(budget)]);
        if (my !== token) return;
        if (first === 'timeout') return tooSlowNow(`first synthesis not ready after ${budget} ms`);
        if (!('samples' in first)) {
          drop(entry);
          // Failing before it ever produced audio: the model and config do not belong together (or the voice is damaged).
          markBroken(voice, errText(first.error));
          return useFallback('synthesis-error', req, voice.id, errText(first.error));
        }
        const ms = now() - t0;
        const verdict = opts.acceptFirstSynthesis?.({ ms, audioSeconds: first.samples.length / first.sampleRate }) ?? { ok: true as const };
        if (!verdict.ok) return tooSlowNow(verdict.why);
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
