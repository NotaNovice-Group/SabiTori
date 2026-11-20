/**
 * Kokoro-82M inference, independent of where the model runs: the espeak-ng phonemizer and the model are injected,
 * so the text work (phonemes, ids, style row, chunking) is the same everywhere and testable in node with fakes.
 * No transformers.js: the model takes three plain tensors.
 *
 *   input_ids  int64   [1, n]    pad, phoneme ids, pad (text.ts)
 *   style      float32 [1, 256]  row n-2 of the voice file (float32 [510, 256])
 *   speed      float32 [1]
 *   -> waveform float32, 24 kHz
 *
 * Two model back ends: onnxruntime-web in a Web Worker (ortModelOpener, the web path) and the phone's native
 * onnxruntime through the SabiToriKokoro Capacitor plugin (native.ts). One model serves every Kokoro voice: it is
 * opened once and shared; each voice only adds its 0.5 MB style file.
 */
import type { OrtLike, PhonemizerLike, SessionLike } from '../piper/runtime.js';
import type { PiperAudio } from '../piper/engine.js';
import { chunkPhonemes, kokoroIds, kokoroPhonemes, kokoroSpeed, KOKORO_SAMPLE_RATE, KOKORO_STYLE_DIM, KOKORO_STYLE_ROWS, styleRow } from './text.js';
import type { KokoroVoiceSpec } from './voices.js';

/** An opened Kokoro model: ids (pads included), the 256-float style row and the speed in, 24 kHz samples out. */
export interface KokoroModel {
  run(ids: number[], style: Float32Array, speed: number): Promise<Float32Array>;
  release(): void;
}

export interface KokoroRuntimeDeps {
  loadPhonemizer: () => Promise<PhonemizerLike>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
  /** Opens the model at this URL. Called once per model while any voice uses it. */
  openModel: (modelUrl: string) => Promise<KokoroModel>;
}

export interface LoadedKokoroVoice {
  synthesize(text: string, opts: { lengthScale: number }): Promise<PiperAudio>;
  release(): void;
}

const INPUTS = ['input_ids', 'style', 'speed'];

/** The web back end: onnxruntime-web (WebAssembly) runs the model fetched from `modelUrl`. */
export function ortModelOpener(ort: OrtLike, fetchBytes: (url: string) => Promise<Uint8Array>): (modelUrl: string) => Promise<KokoroModel> {
  const { Tensor } = ort;
  return async (url) => {
    const bytes = await fetchBytes(url);
    const s: SessionLike = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const missing = s.inputNames ? INPUTS.filter((n) => !s.inputNames!.includes(n)) : [];
    if (missing.length) {
      void Promise.resolve(s.release?.()).catch(() => undefined);
      throw new Error(`not a Kokoro model: it has no input ${missing.map((n) => `"${n}"`).join(', ')} (inputs: ${s.inputNames!.join(', ') || 'none'})`);
    }
    return {
      async run(ids, style, speed) {
        const out = await s.run({
          input_ids: new Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
          style: new Tensor('float32', style, [1, KOKORO_STYLE_DIM]),
          speed: new Tensor('float32', Float32Array.from([speed]), [1]),
        });
        const wave = out.waveform ?? Object.values(out)[0];
        if (!wave) throw new Error('Kokoro model returned no audio');
        return wave.data instanceof Float32Array ? wave.data : Float32Array.from(wave.data);
      },
      release() {
        void Promise.resolve(s.release?.()).catch(() => undefined);
      },
    };
  };
}

export function createKokoroRuntime(deps: KokoroRuntimeDeps): { load(voice: KokoroVoiceSpec): Promise<LoadedKokoroVoice> } {
  let phonemizer: Promise<PhonemizerLike> | null = null;
  const getPhonemizer = (): Promise<PhonemizerLike> => (phonemizer ??= deps.loadPhonemizer().catch((e) => {
    phonemizer = null;
    throw e;
  }));
  /** Opened models by URL, with how many voices use them; released when the last voice is. */
  const models = new Map<string, { model: Promise<KokoroModel>; users: number }>();

  const acquire = (url: string): Promise<KokoroModel> => {
    let m = models.get(url);
    if (!m) {
      const model = deps.openModel(url);
      const entry = { model, users: 0 };
      m = entry;
      models.set(url, entry);
      model.catch(() => models.get(url) === entry && models.delete(url));
    }
    m.users++;
    return m.model;
  };
  const releaseModel = (url: string): void => {
    const m = models.get(url);
    if (!m) return;
    if (--m.users > 0) return;
    models.delete(url);
    void m.model.then((s) => s.release()).catch(() => undefined);
  };

  return {
    async load(voice) {
      const [phon, style, model] = await Promise.all([
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
        // The model may have opened although the voice failed: drop this voice's claim on it.
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
            const samples = await model.run(ids, styleRow(style, ids.length).slice(), speed);
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
