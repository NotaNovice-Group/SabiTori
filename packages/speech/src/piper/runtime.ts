/**
 * Piper inference, independent of where it runs: onnxruntime-web and the espeak-ng phonemizer are
 * injected, so the logic (config, ids, feeds, output) is testable in node with fakes and runs in a
 * Web Worker in the app.
 */
import { parsePiperConfig, phonemesToIds, textToIds, type PiperConfig } from './config.js';
import type { PiperAudio, PiperVoiceSpec } from './engine.js';

interface TensorLike {
  data: Float32Array | ArrayLike<number>;
}
export interface SessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike>>;
  release?(): Promise<void> | void;
}
export interface OrtLike {
  InferenceSession: { create(model: Uint8Array, opts?: Record<string, unknown>): Promise<SessionLike> };
  Tensor: new (type: string, data: unknown, dims?: number[]) => unknown;
}
/** espeak-ng through piper-phonemize: text in, IPA symbols out. */
export interface PhonemizerLike {
  phonemize(espeakVoice: string, text: string): string[];
}

export interface RuntimeDeps {
  ort: OrtLike;
  /** Called at most once, and only for models with phoneme_type "espeak". */
  loadPhonemizer: () => Promise<PhonemizerLike>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
}

export interface LoadedVoice {
  config: PiperConfig;
  /** `lengthScale` multiplies the model's own length_scale: 1 = as trained, 2 = half speed. */
  synthesize(text: string, opts: { lengthScale: number }): Promise<PiperAudio>;
  release(): void;
}

export function createPiperRuntime(deps: RuntimeDeps): { load(voice: PiperVoiceSpec): Promise<LoadedVoice> } {
  let phonemizer: Promise<PhonemizerLike> | null = null;
  const getPhonemizer = (): Promise<PhonemizerLike> => (phonemizer ??= deps.loadPhonemizer().catch((e) => {
    phonemizer = null;
    throw e;
  }));

  return {
    async load(voice) {
      const cfgBytes = await deps.fetchBytes(voice.configUrl);
      const config = parsePiperConfig(JSON.parse(new TextDecoder().decode(cfgBytes)));
      const phon = config.phoneme_type === 'text' ? null : await getPhonemizer();
      const model = await deps.fetchBytes(voice.modelUrl);
      const session = await deps.ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      const multi = (config.num_speakers ?? 1) > 1;
      const { Tensor } = deps.ort;

      return {
        config,
        async synthesize(text, { lengthScale }) {
          const ids = phon ? phonemesToIds(phon.phonemize(config.espeak!.voice, text), config.phoneme_id_map) : textToIds(text, config.phoneme_id_map);
          // BOS + PAD + EOS only: nothing the model knows was in the text.
          if (ids.length <= 3) return { samples: new Float32Array(0), sampleRate: config.audio.sample_rate };
          const feeds: Record<string, unknown> = {
            input: new Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
            input_lengths: new Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
            scales: new Tensor('float32', Float32Array.from([config.inference.noise_scale, config.inference.length_scale * lengthScale, config.inference.noise_w]), [3]),
          };
          if (multi) feeds.sid = new Tensor('int64', BigInt64Array.from([0n]), [1]);
          const out = await session.run(feeds);
          const first = out.output ?? Object.values(out)[0];
          if (!first) throw new Error('Piper model returned no audio');
          const samples = first.data instanceof Float32Array ? first.data : Float32Array.from(first.data);
          return { samples, sampleRate: config.audio.sample_rate };
        },
        release() {
          void Promise.resolve(session.release?.()).catch(() => undefined);
        },
      };
    },
  };
}
