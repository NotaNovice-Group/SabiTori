/**
 * Voices, best first, each one falling back to the next so the listener is never left in silence:
 *
 * 1. Kokoro-82M (English and French): a soft, smooth open neural voice, offline in its own Web Worker. Off for the
 *    session when this phone is too slow for it (packages/speech/src/kokoro/speed-guard.ts) or it cannot load.
 * 2. Piper, for packs whose manifest says `engine: 'piper'` (French and English today, community voices later),
 *    also offline in a Web Worker. On iOS an Enhanced, Premium or Siri phone voice is preferred over Piper.
 * 3. The phone's own TTS: Android's offline TextToSpeech inside the Capacitor app (its WebView has no
 *    window.speechSynthesis), the Web Speech API in a browser.
 *
 * Recorded clips still play through <audio>.
 */
import { Capacitor } from '@capacitor/core';
import { pickVoice, SMOOTH_RANK, type PhoneVoice } from './voice-pick';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import {
  createBrowserClips,
  createBrowserTts,
  createKokoroTts,
  createKokoroVoiceResolver,
  createKokoroWorkerEngines,
  createPacksVoiceResolver,
  createPiperTts,
  createPiperWorkerEngines,
  createPlayer,
  createWebAudioOutput,
  KOKORO_VERSION,
  kokoroThreads,
  piperSupported,
  skipKokoro,
  TtsVoiceUnavailableError,
  type ClipBackend,
  type ManifestList,
  type SlowVerdict,
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
 * whenever the phone has one for the language; Piper (and then the compact system voice) otherwise. This sits
 * below Kokoro: it only decides who speaks when Kokoro cannot.
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

export interface KokoroMemory {
  get(): unknown;
  set(v: SlowVerdict): void;
}

const KOKORO_MEMORY_KEY = 'sabitori.kokoro.slow';

/** The Kokoro verdict in local storage; storage that is blocked or full just means Kokoro is tested again. */
function localKokoroMemory(): KokoroMemory {
  return {
    get() {
      try {
        return JSON.parse(globalThis.localStorage?.getItem(KOKORO_MEMORY_KEY) ?? 'null');
      } catch {
        return null;
      }
    },
    set(v) {
      try {
        globalThis.localStorage?.setItem(KOKORO_MEMORY_KEY, JSON.stringify(v));
      } catch {
        /* not remembered: tested again next start */
      }
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

/**
 * Kokoro on top of Piper on top of the system voice, or just the system voice where neither can run (no
 * Worker/WebAssembly/Web Audio).
 */
export function createAppTts(
  system: TtsBackend,
  opts?: {
    baseUrl?: string;
    piper?: boolean;
    /** False: no Kokoro, Piper is the top voice. Default true (where Piper can run, Kokoro can too). */
    kokoro?: boolean;
    /** Wraps the Piper backend before Kokoro falls back to it (iOS: prefer a smooth phone voice over Piper). */
    belowKokoro?: (piper: TtsBackend) => TtsBackend;
    /** Where the "too slow for Kokoro" verdict is kept across starts. Default: local storage. */
    kokoroMemory?: KokoroMemory;
    resolveUrl?: (url: string) => Promise<string | null>;
    fetchJson?: (url: string) => Promise<unknown>;
    /** The pack registry's shared manifest list, so voices do not fetch every manifest a second time. */
    list?: () => Promise<ManifestList>;
  },
): TtsBackend {
  if (!(opts?.piper ?? piperSupported())) return system;
  const base = new URL(opts?.baseUrl ?? import.meta.env.BASE_URL, globalThis.document?.baseURI ?? globalThis.location?.href).href;
  const packs = `${base}packs`;
  const output = createWebAudioOutput(); // one audio device for both neural voices
  // Voices delivered by the signed update channel (an English voice, or a community-trained one) are
  // read from the update store; manifests too, so an update can switch a language to its new voice.
  const packVoice = createPacksVoiceResolver(packs, opts?.fetchJson, opts?.resolveUrl, opts?.list ? { list: opts.list } : undefined);
  const piper = createPiperTts({
    engines: createPiperWorkerEngines(`${base}piper/`, `${base}ort/`),
    resolveVoice: packVoice,
    fallback: system,
    output,
  });
  const below = opts?.belowKokoro ? opts.belowKokoro(piper) : piper;
  const lang = globalThis.navigator?.language;
  const threads = kokoroThreads();
  const memory = opts?.kokoroMemory ?? localKokoroMemory();
  // This phone was found too slow for Kokoro recently: do not load the 92 MB model again only to find out again.
  if (opts?.kokoro === false || skipKokoro(memory.get(), Date.now(), KOKORO_VERSION, threads)) {
    // Load the voice of the phone's language while the person looks at the card, so the first sentence
    // is not delayed by the load. Other voices load on first use.
    if (lang) void piper.warm(lang);
    return below;
  }
  const kokoro = createKokoroTts({
    engines: createKokoroWorkerEngines(`${base}piper/`, `${base}ort/`, threads),
    // The packs decide: a part spoken with the "en" or "fr" Piper voice files gets the Kokoro voice of that language.
    resolveVoice: createKokoroVoiceResolver(packVoice, `${base}kokoro/`),
    fallback: below,
    output,
    onEvent: (e) => {
      if (e.type !== 'fallback') return;
      // Too slow on this phone: remember it (skipKokoro), so the next starts do not load the model at all.
      if (e.reason === 'first-synthesis-slow') memory.set({ version: KOKORO_VERSION, threads, at: Date.now(), ...(e.detail ? { why: e.detail } : {}) });
      // Kokoro is off for the session (too slow, or it cannot load): get Piper ready for the next sentences.
      if (lang && (e.reason === 'first-synthesis-slow' || e.reason === 'load-error' || e.reason === 'synthesis-error')) void piper.warm(lang);
    },
  });
  // Load Kokoro for the phone's language while the person looks at the card. Only when Kokoro has no voice for it
  // (or cannot load) is Piper loaded instead: two neural models at once is too much memory for a cheap phone.
  if (lang) void kokoro.warm(lang).then((ok) => !ok && piper.warm(lang));
  return kokoro;
}

export function createAppPlayer(
  resolveClip?: (url: string) => Promise<string | null>,
  fetchJson?: (url: string) => Promise<unknown>,
  list?: () => Promise<ManifestList>,
): Player {
  const native = Capacitor.isNativePlatform();
  const clips = resolveClip ? withOverlay(createBrowserClips(), resolveClip) : createBrowserClips();
  const system = native ? createNativeTts() : createBrowserTts();
  const ios = native && Capacitor.getPlatform() === 'ios';
  const tts = createAppTts(system, {
    ...(resolveClip ? { resolveUrl: resolveClip } : {}),
    ...(fetchJson ? { fetchJson } : {}),
    ...(list ? { list } : {}),
    // iPhone: Kokoro first; when it cannot speak, a smooth installed phone voice before Piper.
    ...(ios ? { belowKokoro: (piper: TtsBackend) => preferSmoothPhoneVoice(system, piper) } : {}),
  });
  return createPlayer({ tts, clips });
}
