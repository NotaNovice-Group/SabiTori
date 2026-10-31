/**
 * Android's WebView does not implement window.speechSynthesis, so inside the
 * Capacitor app French and English are spoken through Android's own offline
 * TextToSpeech engine. Recorded clips still play through <audio>.
 * In a browser (PWA, dev) the Web Speech backend is used unchanged.
 */
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { createBrowserClips, createBrowserPlayer, createBrowserTts, createPlayer, type ClipBackend, type Player, type TtsBackend } from '@sabitori/speech';

function createNativeTts(): TtsBackend {
  return {
    async speak({ text, bcp47, rate, onProgress }) {
      onProgress?.(0);
      // The plugin resolves when the utterance finishes and rejects on engine errors.
      await TextToSpeech.speak({ text, lang: bcp47, rate, pitch: 1, volume: 1, category: 'playback' });
      onProgress?.(1);
    },
    cancel() {
      void TextToSpeech.stop().catch(() => undefined);
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

export function createAppPlayer(resolveClip?: (url: string) => Promise<string | null>): Player {
  const native = Capacitor.isNativePlatform();
  if (!native && !resolveClip) return createBrowserPlayer();
  const clips = resolveClip ? withOverlay(createBrowserClips(), resolveClip) : createBrowserClips();
  return createPlayer({ tts: native ? createNativeTts() : createBrowserTts(), clips });
}
