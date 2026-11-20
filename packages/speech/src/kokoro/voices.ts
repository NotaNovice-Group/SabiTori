import type { PiperVoiceSpec } from '../piper/engine.js';
import type { VoiceRef } from '../piper/voices.js';
import type { KokoroLang } from './text.js';

/**
 * A Kokoro voice: the shared model plus one style file. It is a PiperVoiceSpec so the same TTS backend
 * (createPiperTts: cache, fallback, sentence pipelining) and worker client drive it; `configUrl` is the style file.
 */
export interface KokoroVoiceSpec extends PiperVoiceSpec {
  /** voices/<name>.bin: float32 [510, 256]. */
  styleUrl: string;
  /** espeak-ng voice for the phonemizer ("en-us", "fr"). */
  espeakVoice: string;
  /** Which phoneme spelling rules apply (text.ts kokoroPhonemes). */
  lang: KokoroLang;
}

/** Model file shipped in the app (scripts/fetch-kokoro.mjs). */
export const KOKORO_MODEL_FILE = 'model_uint8.onnx';
/** Bump with the model or voice files (scripts/fetch-kokoro.mjs): part of every cache key. */
export const KOKORO_VERSION = 'v1.0-1939ad2-uint8';

/**
 * Which Kokoro voice speaks the text a pack's Piper voice would speak, keyed by that Piper voice's folder (the pack
 * tag, or its `voicePack`): English text (and Pidgin, which uses the English voice) and French. Voices from
 * onnx-community/Kokoro-82M-v1.0-ONNX: af_heart (American English, grade A in the model card) and ff_siwis (French).
 */
export const KOKORO_VOICES: Readonly<Record<string, { voice: string; espeakVoice: string; lang: KokoroLang }>> = Object.freeze({
  en: { voice: 'af_heart', espeakVoice: 'en-us', lang: 'en-us' },
  fr: { voice: 'ff_siwis', espeakVoice: 'fr', lang: 'fr' },
});

/** The Kokoro voice for a pack voice folder ("en", "fr"), or null when Kokoro has none for it. `base` is where the Kokoro files are served, ending in "/" or not. */
export function kokoroVoiceFor(folder: string, base: string): KokoroVoiceSpec | null {
  const v = Object.prototype.hasOwnProperty.call(KOKORO_VOICES, folder) ? KOKORO_VOICES[folder] : undefined;
  if (!v) return null;
  const b = base.replace(/\/+$/, '');
  const styleUrl = `${b}/voices/${v.voice}.bin`;
  return { id: `kokoro:${v.voice}`, modelUrl: `${b}/${KOKORO_MODEL_FILE}`, configUrl: styleUrl, styleUrl, espeakVoice: v.espeakVoice, lang: v.lang, version: KOKORO_VERSION };
}

/**
 * Kokoro voices follow the packs: a part whose pack speaks with the "en" or "fr" Piper voice files gets the Kokoro
 * voice of that language; any other pack (a community voice, a recorded language) gets none, so its own Piper
 * voice or the phone's voice speaks. `piper` is the app's Piper resolver (createPacksVoiceResolver).
 */
export function createKokoroVoiceResolver(
  piper: (bcp47: string, ref?: VoiceRef) => Promise<PiperVoiceSpec | null>,
  base: string,
): (bcp47: string, ref?: VoiceRef) => Promise<KokoroVoiceSpec | null> {
  return async (bcp47, ref) => {
    const p = await piper(bcp47, ref);
    if (!p) return null;
    const folder = p.id.split(':')[0] ?? '';
    return kokoroVoiceFor(folder, base);
  };
}
