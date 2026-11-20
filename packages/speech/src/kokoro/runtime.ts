/**
 * Kokoro-82M inference, independent of where it runs: onnxruntime-web and the espeak-ng phonemizer are injected
 * (the same ones Piper uses), so the logic is testable in node with fakes and runs in a Web Worker in the app.
 * No transformers.js: the model takes three plain tensors.
 *
 *   input_ids  int64   [1, n]    pad, phoneme ids, pad (text.ts)
 *   style      float32 [1, 256]  row n-2 of the voice file (float32 [510, 256])
 *   speed      float32 [1]
 *   -> waveform float32, 24 kHz
 *
 * One model serves every Kokoro voice: it is loaded once and shared; each voice only adds its 0.5 MB style file.
 */
import type { OrtLike, PhonemizerLike, SessionLike } from '../piper/runtime.js';
import type { PiperAudio } from '../piper/engine.js';
import { chunkPhonemes, kokoroIds, kokoroPhonemes, kokoroSpeed, KOKORO_SAMPLE_RATE, KOKORO_STYLE_DIM, KOKORO_STYLE_ROWS, styleRow } from './text.js';
import type { KokoroVoiceSpec } from './voices.js';

export interface KokoroRuntimeDeps {
  ort: OrtLike;
  loadPhonemizer: () => Promise<PhonemizerLike>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
}

export interface LoadedKokoroVoice {
  synthesize(text: string, opts: { lengthScale: number }): Promise<PiperAudio>;
  release(): void;
}

const INPUTS = ['input_ids', 'style', 'speed'];

export function createKokoroRuntime(deps: KokoroRuntimeDeps): { load(voice: KokoroVoiceSpec): Promise<LoadedKokoroVoice> } {
  let phonemizer: Promise<PhonemizerLike> | null = null;
  const getPhonemizer = (): Promise<PhonemizerLike> => (phonemizer ??= deps.loadPhonemizer().catch((e) => {
    phonemizer = null;
    throw e;
  }));
  /** Loaded models by URL, with how many voices use them; released when the last voice is. */
  const models = new Map<string, { session: Promise<SessionLike>; users: number }>();
  const { Tensor } = deps.ort;

  const acquire = (url: string): Promise<SessionLike> => {
    let m = models.get(url);
    if (!m) {
      const session = (async () => {
        const bytes = await deps.fetchBytes(url);
        const s = await deps.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
        const missing = s.inputNames ? INPUTS.filter((n) => !s.inputNames!.includes(n)) : [];
        if (missing.length) {
          void Promise.resolve(s.release?.()).catch(() => undefined);
          throw new Error(`not a Kokoro model: it has no input ${missing.map((n) => `"${n}"`).join(', ')} (inputs: ${s.inputNames!.join(', ') || 'none'})`);
        }
        return s;
      })();
      m = { session, users: 0 };
      models.set(url, m);
      session.catch(() => models.get(url) === m && models.delete(url));
    }
    m.users++;
    return m.session;
  };
  const releaseModel = (url: string): void => {
    const m = models.get(url);
    if (!m) return;
    if (--m.users > 0) return;
    models.delete(url);
    void m.session.then((s) => s.release?.()).catch(() => undefined);
  };

  return {
    async load(voice) {
      const [phon, style, session] = await Promise.all([
        getPhonemizer(),
        deps.fetchBytes(voice.styleUrl).then((b) => {
          const floats = b.byteLength / 4;
          if (!Number.isInteger(floats) || floats !== KOKORO_STYLE_ROWS * KOKORO_STYLE_DIM) {
            throw new Error(`Kokoro voice file ${voice.styleUrl} has ${b.byteLength} bytes, expected ${KOKORO_STYLE_ROWS * KOKORO_STYLE_DIM * 4}`);
          }
          // Copy into an aligned buffer (a view into a larger fetch buffer may start at an odd offset).
          return new Float32Array(b.slice().buffer);
        }),
        acquire(voice.modelUrl),
      ]).catch((e) => {
        // The model may have loaded although the voice failed: drop this voice's claim on it.
        if (models.has(voice.modelUrl)) releaseModel(voice.modelUrl);
        throw e;
      });
      let released = false;

      return {
        async synthesize(text, { lengthScale }) {
          // piper-phonemize returns the symbols one by one: one string for kokoroPhonemes.
          const ipa = kokoroPhonemes([phon.phonemize(voice.espeakVoice, text).join('')], voice.lang);
          const speed = kokoroSpeed(lengthScale);
          const parts: Float32Array[] = [];
          for (const piece of chunkPhonemes(ipa)) {
            const ids = kokoroIds(piece);
            if (ids.length <= 2) continue; // nothing the model can say
            const out = await session.run({
              input_ids: new Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
              style: new Tensor('float32', styleRow(style, ids.length).slice(), [1, KOKORO_STYLE_DIM]),
              speed: new Tensor('float32', Float32Array.from([speed]), [1]),
            });
            const wave = out.waveform ?? Object.values(out)[0];
            if (!wave) throw new Error('Kokoro model returned no audio');
            const samples = wave.data instanceof Float32Array ? wave.data : Float32Array.from(wave.data);
            // A numeric failure inside the model (seen with the q8f16 file in single-thread wasm) gives NaN audio,
            // which plays as silence: refuse it so the fallback voice speaks instead.
            if (!allFinite(samples)) throw new Error('Kokoro produced invalid audio (not a number)');
            parts.push(samples);
          }
          const samples = parts.length === 1 ? parts[0]! : concat(parts);
          return { samples, sampleRate: KOKORO_SAMPLE_RATE };
        },
        release() {
          if (released) return;
          released = true;
          releaseModel(voice.modelUrl);
        },
      };
    },
  };
}

export function allFinite(samples: Float32Array): boolean {
  for (let i = 0; i < samples.length; i++) if (!Number.isFinite(samples[i]!)) return false;
  return true;
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
