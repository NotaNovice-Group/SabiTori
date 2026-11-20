/**
 * Is Kokoro fast enough on this phone? Decided once per session, on the first synthesis, so nobody waits in silence:
 *
 * - The first piece must be ready within KOKORO_FIRST_AUDIO_MS (2.5 s). A long first piece gets more time in
 *   proportion to its expected length (KOKORO_BUDGET_PER_AUDIO_S per second of speech), never more than
 *   KOKORO_MAX_WAIT_MS. Past that deadline the listener hears Piper instead (the TTS backend stops waiting).
 * - Once ready, its real-time factor (synthesis time / audio length) must be below KOKORO_MAX_RTF (1.0). Above
 *   it, each next sentence would take longer to make than the current one takes to play: gaps between sentences.
 *
 * Either failure switches Kokoro off for the session and Piper (then the phone's voice) speaks. Pure: unit-tested.
 */

export const KOKORO_FIRST_AUDIO_MS = 2500;
export const KOKORO_MAX_WAIT_MS = 5000;
export const KOKORO_BUDGET_PER_AUDIO_S = 600;
export const KOKORO_MAX_RTF = 1.0;
/** Speech length estimate for the deadline: characters of text per second of Kokoro speech at rate 1. */
export const CHARS_PER_AUDIO_SECOND = 14;

/** How long the first synthesis of a session may take for this piece of text, in ms. */
export function kokoroFirstSynthesisBudget(text: string, rate = 1): number {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const audioS = text.length / CHARS_PER_AUDIO_SECOND / r;
  return Math.round(Math.min(Math.max(KOKORO_FIRST_AUDIO_MS, audioS * KOKORO_BUDGET_PER_AUDIO_S), KOKORO_MAX_WAIT_MS));
}

export interface FirstSynthesis {
  ms: number;
  audioSeconds: number;
}

export type SpeedVerdict = { ok: true; rtf: number } | { ok: false; rtf: number; why: string };

/** The verdict on a first synthesis that finished: real-time factor below KOKORO_MAX_RTF. Empty audio says nothing about speed (ok). */
export function kokoroSpeedVerdict(m: FirstSynthesis, maxRtf = KOKORO_MAX_RTF): SpeedVerdict {
  if (!(m.audioSeconds > 0)) return { ok: true, rtf: 0 };
  const rtf = m.ms / 1000 / m.audioSeconds;
  if (rtf < maxRtf) return { ok: true, rtf };
  return { ok: false, rtf, why: `real-time factor ${rtf.toFixed(2)} (limit ${maxRtf})` };
}

/** What the app remembers (in local storage) after Kokoro was too slow on this phone. */
export interface SlowVerdict {
  /** KOKORO_VERSION the verdict was made with: a new model or runtime is tested again. */
  version: string;
  /** onnxruntime threads it ran with. */
  threads: number;
  /** When (ms since epoch). */
  at: number;
  why?: string;
}

/** A remembered verdict is trusted this long, then Kokoro is tested again (it may have been judged while the phone was busy). */
export const KOKORO_RETEST_MS = 30 * 24 * 3600 * 1000;

/**
 * True when Kokoro should not even be loaded: this phone was found too slow for this model and thread count less
 * than KOKORO_RETEST_MS ago. Loading a 177 MB model only to find out again costs memory and battery on every start.
 * Anything unreadable counts as no verdict.
 */
export function skipKokoro(stored: unknown, now: number, version: string, threads: number, retestMs = KOKORO_RETEST_MS): boolean {
  if (typeof stored !== 'object' || stored === null) return false;
  const v = stored as Partial<SlowVerdict>;
  if (v.version !== version || v.threads !== threads || typeof v.at !== 'number' || !Number.isFinite(v.at)) return false;
  return now >= v.at && now - v.at < retestMs;
}
