/**
 * Voices. Packs whose manifest says `engine: 'piper'` (French and English today, community voices
 * later) are spoken by Piper, a small open neural voice that runs offline in a Web Worker (web and
 * Android WebView alike). The phone's own TTS stays underneath as the automatic fallback: Android's
 * offline TextToSpeech inside the Capacitor app (its WebView has no window.speechSynthesis), the Web
 * Speech API in a browser. If Piper cannot load, is too slow on this phone, or cannot make sound, the
 * system voice speaks instead and the listener is never left in silence. Recorded clips still play
 * through <audio>.
 */
import { Capacitor } from '@capacitor/core';
import { pickVoice, SMOOTH_RANK, type PhoneVoice } from './voice-pick';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import {
  createBrowserClips,
  createBrowserTts,
  createPacksVoiceResolver,
  createPiperTts,
  createPiperWorkerEngines,
  createPlayer,
  piperSupported,
  TtsVoiceUnavailableError,
  type ClipBackend,
  type ManifestList,
  type Player,
  type TtsBackend,
} from '@sabitori/speech';

function createNativeTts(): TtsBackend {
  // Android says which languages its engine can speak. Speaking one it cannot would read the words with
  // another language's voice: refuse instead, so the player re-renders the section in the next fallback
  // language (and the card says "Spoken in ...").
  const supported = new Map<string, Promise<boolean>>();
  const can = (lang: string) => {
    let p = supported.get(lang);
    if (!p) {
      p = TextToSpeech.isLanguageSupported({ lang }).then((r) => r.supported !== false, () => true);
      supported.set(lang, p);
    }
    return p;
  };
  return {
    async speak({ text, bcp47, rate, onProgress }) {
      if (!(await can(bcp47))) throw new TtsVoiceUnavailableError(bcp47);
      onProgress?.(0);
      // Name the best installed voice: the phone's default for a language is often its robotic "compact" one.
      const best = pickVoice(await phoneVoices(), bcp47);
      // The plugin resolves when the utterance finishes and rejects on engine errors.
      await TextToSpeech.speak({ text, lang: bcp47, rate, pitch: 1, volume: 1, category: 'playback', ...(best ? { voice: best.index } : {}) });
      onProgress?.(1);
    },
    cancel() {
      void TextToSpeech.stop().catch(() => undefined);
    },
  };
}

let voiceList: Promise<PhoneVoice[]> | null = null;
/** The phone's installed voices, read once (index order is what `speak({ voice })` expects). */
export function phoneVoices(): Promise<PhoneVoice[]> {
  voiceList ??= TextToSpeech.getSupportedVoices().then(
    (r) => (r.voices ?? []).map((v) => ({ voiceURI: v.voiceURI ?? '', name: v.name ?? '', lang: v.lang ?? '' })),
    () => [],
  );
  return voiceList;
}

/** True when this phone has a smooth (Enhanced, Premium or Siri) voice for the language. */
export async function hasSmoothPhoneVoice(bcp47: string): Promise<boolean> {
  return (pickVoice(await phoneVoices(), bcp47)?.rank ?? -1) >= SMOOTH_RANK;
}

/**
 * iPhone: its Enhanced, Premium and Siri voices are smoother than the bundled Piper voices, so they speak
 * whenever the phone has one for the language; Piper (and then the compact system voice) otherwise.
 */
function preferSmoothPhoneVoice(system: TtsBackend, piper: TtsBackend): TtsBackend {
  let active: TtsBackend = piper;
  return {
    async speak(req) {
      active = (await hasSmoothPhoneVoice(req.bcp47)) ? system : piper;
      return active.speak(req);
    },
    cancel() {
      system.cancel();
      piper.cancel();
    },
  };
}

/** Plays a clip from the downloaded update set when it has one, else the bundled file. */
function withOverlay(inner: ClipBackend, resolveClip: (url: string) => Promise<string | null>): ClipBackend {
  return {
    async play({ url, rate }) {
      const hit = await resolveClip(url).catch(() => null);
      return inner.play({ url: hit ?? url, rate });
    },
    cancel: () => inner.cancel(),
  };
}

/** Piper on top of the system voice, or just the system voice where Piper cannot run (no Worker/WebAssembly/Web Audio). */
export function createAppTts(
  system: TtsBackend,
  opts?: {
    baseUrl?: string;
    piper?: boolean;
    resolveUrl?: (url: string) => Promise<string | null>;
    fetchJson?: (url: string) => Promise<unknown>;
    /** The pack registry's shared manifest list, so voices do not fetch every manifest a second time. */
    list?: () => Promise<ManifestList>;
  },
): TtsBackend {
  if (!(opts?.piper ?? piperSupported())) return system;
  const base = new URL(opts?.baseUrl ?? import.meta.env.BASE_URL, globalThis.document?.baseURI ?? globalThis.location?.href).href;
  const packs = `${base}packs`;
  const tts = createPiperTts({
    engines: createPiperWorkerEngines(`${base}piper/`, `${base}ort/`),
    // Voices delivered by the signed update channel (an English voice, or a community-trained one) are
    // read from the update store; manifests too, so an update can switch a language to its new voice.
    resolveVoice: createPacksVoiceResolver(packs, opts?.fetchJson, opts?.resolveUrl, opts?.list ? { list: opts.list } : undefined),
    fallback: system,
  });
  // Load the voice of the phone's language while the person looks at the card, so the first sentence
  // is not delayed by the load. Other voices load on first use.
  const lang = globalThis.navigator?.language;
  if (lang) void tts.warm(lang);
  return tts;
}

export function createAppPlayer(
  resolveClip?: (url: string) => Promise<string | null>,
  fetchJson?: (url: string) => Promise<unknown>,
  list?: () => Promise<ManifestList>,
): Player {
  const native = Capacitor.isNativePlatform();
  const clips = resolveClip ? withOverlay(createBrowserClips(), resolveClip) : createBrowserClips();
  const system = native ? createNativeTts() : createBrowserTts();
  const piper = createAppTts(system, {
    ...(resolveClip ? { resolveUrl: resolveClip } : {}),
    ...(fetchJson ? { fetchJson } : {}),
    ...(list ? { list } : {}),
  });
  const tts = native && Capacitor.getPlatform() === 'ios' ? preferSmoothPhoneVoice(system, piper) : piper;
  return createPlayer({ tts, clips });
}
