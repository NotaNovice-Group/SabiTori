import type { TtsBackend } from '../player.js';
import type { AudioOutput } from '../piper/audio.js';
import { splitSentences } from '../piper/config.js';
import type { PiperEngine } from '../piper/engine.js';
import { createPiperTts, type PiperEvent, type PiperTts } from '../piper/tts.js';
import { kokoroFirstSynthesisBudget, kokoroSpeedVerdict } from './speed-guard.js';
import { splitForFirstAudio } from './text.js';
import type { VoiceRef } from '../piper/voices.js';
import type { KokoroVoiceSpec } from './voices.js';

/** Speed-test sentences (about 2.5 s of speech): synthesized once after loading, never played. */
export const KOKORO_PROBE: Readonly<Record<string, string>> = Object.freeze({
  'en-us': 'Hello, I am going to read this message to you.',
  'en-gb': 'Hello, I am going to read this message to you.',
  fr: 'Bonjour, je vais vous lire ce message.',
});

export interface KokoroTtsOptions {
  engines: (voice: KokoroVoiceSpec) => PiperEngine;
  resolveVoice: (bcp47: string, ref?: VoiceRef) => KokoroVoiceSpec | null | Promise<KokoroVoiceSpec | null>;
  /** Speaks whatever Kokoro cannot: the Piper backend (which falls back to the phone's voice in turn). */
  fallback: TtsBackend;
  output?: AudioOutput;
  /** How long an utterance waits for the model (92 MB) still loading before the fallback speaks it. Default 6000. */
  loadGraceMs?: number;
  maxCacheBytes?: number;
  onEvent?: (e: PiperEvent) => void;
  now?: () => number;
}

/**
 * Kokoro-82M as a TTS backend: the same machinery as Piper (sentence pipelining, "Again" cache, fallback that never
 * leaves silence), with Kokoro's speed guard (speed-guard.ts): a short speed test right after the model loads (warm),
 * or else the first synthesis of the session, is timed, and a phone that is too slow switches Kokoro off for the
 * session, for every language (one model serves them all).
 */
export function createKokoroTts(opts: KokoroTtsOptions): PiperTts {
  return createPiperTts<KokoroVoiceSpec>({
    engines: opts.engines,
    resolveVoice: opts.resolveVoice,
    fallback: opts.fallback,
    ...(opts.output ? { output: opts.output } : {}),
    ...(opts.onEvent ? { onEvent: opts.onEvent } : {}),
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.maxCacheBytes ? { maxCacheBytes: opts.maxCacheBytes } : {}),
    loadGraceMs: opts.loadGraceMs ?? 6000,
    firstSynthesisMs: kokoroFirstSynthesisBudget,
    acceptFirstSynthesis: (m) => {
      const v = kokoroSpeedVerdict(m);
      return v.ok ? { ok: true } : { ok: false, why: v.why };
    },
    slowMeansAllSlow: true,
    // Both languages share one model: two voices loaded costs only their 0.5 MB style files.
    maxLoadedVoices: 2,
    split: (text) => splitForFirstAudio(splitSentences(text)),
    // warm() runs this speed test in the background, so a slow phone is found out before the first tap.
    probe: (voice) => KOKORO_PROBE[voice.lang] ?? null,
  });
}
