/**
 * Android's WebView does not implement window.speechSynthesis, so inside the
 * Capacitor app French and English are spoken through Android's own offline
 * TextToSpeech engine. Recorded clips still play through <audio>.
 * In a browser (PWA, dev) the Web Speech backend is used unchanged.
 */
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { createBrowserClips, createBrowserPlayer, createPlayer, type Player, type TtsBackend } from '@sabitori/speech';

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

export function createAppPlayer(): Player {
  if (!Capacitor.isNativePlatform()) return createBrowserPlayer();
  return createPlayer({ tts: createNativeTts(), clips: createBrowserClips() });
}
