import { createPlayer, type ClipBackend, type Player, type TtsBackend } from './player.js';

/** Split text at sentence/clause boundaries into chunks of at most `max` characters. */
export function chunkText(text: string, max = 180): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const win = rest.slice(0, max);
    let cut = Math.max(win.lastIndexOf('. '), win.lastIndexOf('! '), win.lastIndexOf('? '));
    if (cut < max * 0.3) cut = Math.max(cut, win.lastIndexOf(', '), win.lastIndexOf('; '), win.lastIndexOf(': '));
    if (cut < max * 0.3) cut = win.lastIndexOf(' ');
    if (cut <= 0) cut = max - 1;
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

const norm = (s: string): string => s.toLowerCase().replace(/_/g, '-');

/** Best voice for a BCP 47 tag: exact tag over same language; offline (localService) over network. */
export function pickVoice<V extends { lang: string; localService: boolean }>(voices: V[], bcp47: string): V | undefined {
  const want = norm(bcp47);
  const primary = want.split('-')[0];
  const score = (v: V): number => {
    const l = norm(v.lang);
    const base = l === want ? 4 : l.split('-')[0] === primary ? 2 : 0;
    return base === 0 ? 0 : base + (v.localService ? 1 : 0);
  };
  let best: V | undefined;
  let bestScore = 0;
  for (const v of voices) {
    const s = score(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

interface VoiceLike { lang: string; localService: boolean }
interface UtteranceLike {
  text: string; lang: string; rate: number; voice: unknown;
  onend: ((e?: unknown) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onboundary: ((e: { charIndex?: number; name?: string }) => void) | null;
}
export interface SynthLike {
  speak(u: unknown): void;
  cancel(): void;
  getVoices(): VoiceLike[];
  addEventListener?(type: 'voiceschanged', cb: () => void): void;
  removeEventListener?(type: 'voiceschanged', cb: () => void): void;
}

export function createBrowserTts(opts?: { synth?: SynthLike; makeUtterance?: (text: string) => UtteranceLike }): TtsBackend {
  const getSynth = (): SynthLike | undefined => opts?.synth ?? (globalThis as { speechSynthesis?: SynthLike }).speechSynthesis;
  const makeU =
    opts?.makeUtterance ??
    ((t: string) => new (globalThis as unknown as { SpeechSynthesisUtterance: new (t: string) => UtteranceLike }).SpeechSynthesisUtterance(t));
  let token = 0;
  let live: { finish: () => void } | null = null;
  let keep: UtteranceLike | null = null; // hold a reference: some engines drop utterances that get garbage collected

  async function voices(synth: SynthLike): Promise<VoiceLike[]> {
    const now = synth.getVoices();
    if (now.length > 0 || !synth.addEventListener) return now;
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        synth.removeEventListener?.('voiceschanged', done);
        resolve(synth.getVoices());
      };
      const timer = setTimeout(done, 1500);
      synth.addEventListener!('voiceschanged', done);
    });
  }

  function speakOne(synth: SynthLike, text: string, voice: VoiceLike | undefined, bcp47: string, rate: number, my: number, onBoundary: (charIndex: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const u = makeU(text);
      u.lang = bcp47;
      u.rate = rate;
      if (voice) u.voice = voice;
      let settled = false;
      const finish = (err?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        if (live?.finish === finish) live = null;
        keep = null;
        err ? reject(err) : resolve();
      };
      // Some engines never fire onend; give up after a generous estimate.
      const watchdog = setTimeout(() => finish(), 4000 + (text.length * 120) / Math.max(rate, 0.1));
      u.onend = () => finish();
      u.onerror = (e) => (e?.error === 'canceled' || e?.error === 'interrupted' ? finish() : finish(new Error(`speech error: ${e?.error ?? 'unknown'}`)));
      u.onboundary = (e) => {
        if (my === token && typeof e.charIndex === 'number') onBoundary(e.charIndex);
      };
      live = { finish: () => finish() };
      keep = u;
      synth.speak(u);
    });
  }

  return {
    async speak({ text, bcp47, rate, onProgress }) {
      const synth = getSynth();
      if (!synth) throw new Error('speechSynthesis is not available');
      const my = ++token;
      const list = await voices(synth);
      if (my !== token) return;
      const voice = pickVoice(list, bcp47);
      const chunks = chunkText(text);
      const total = chunks.reduce((n, c) => n + c.length, 0) || 1;
      synth.cancel(); // Android WebView keeps stale queued utterances unless cancelled first
      let done = 0;
      for (const chunk of chunks) {
        if (my !== token) return;
        await speakOne(synth, chunk, voice, bcp47, rate, my, (ci) => onProgress?.((done + Math.min(ci, chunk.length)) / total));
        done += chunk.length;
        if (my === token) onProgress?.(done / total);
      }
    },
    cancel() {
      token++;
      getSynth()?.cancel();
      live?.finish();
    },
  };
}

interface AudioLike {
  src: string; playbackRate: number;
  play(): Promise<void> | void; pause(): void;
  onended: (() => void) | null; onerror: (() => void) | null;
}

export function createBrowserClips(opts?: { makeAudio?: (url: string) => AudioLike }): ClipBackend {
  const make = opts?.makeAudio ?? ((u: string) => new (globalThis as unknown as { Audio: new (u: string) => AudioLike }).Audio(u));
  let live: { audio: AudioLike; finish: () => void } | null = null;
  return {
    play({ url, rate }) {
      return new Promise<void>((resolve, reject) => {
        const audio = make(url);
        audio.playbackRate = rate;
        let settled = false;
        const finish = (err?: unknown): void => {
          if (settled) return;
          settled = true;
          if (live?.audio === audio) live = null;
          err ? reject(err) : resolve();
        };
        audio.onended = () => finish();
        audio.onerror = () => finish(new Error(`cannot play ${url}`));
        live = { audio, finish: () => finish() };
        try {
          Promise.resolve(audio.play()).catch((e) => finish(e));
        } catch (e) {
          finish(e);
        }
      });
    },
    cancel() {
      const l = live;
      live = null;
      if (l) {
        try { l.audio.pause(); } catch { /* ignore */ }
        l.finish();
      }
    },
  };
}

export function createBrowserPlayer(): Player {
  return createPlayer({ tts: createBrowserTts(), clips: createBrowserClips() });
}
