/**
 * Piper inference, independent of where it runs: onnxruntime-web and the espeak-ng phonemizer are
 * injected, so the logic (config, ids, feeds, output) is testable in node with fakes and runs in a
 * Web Worker in the app.
 */
import { MIN_KNOWN_SHARE, parsePiperConfig, phonemesToIds, textToIdsChecked, type PiperConfig } from './config.js';
import type { PiperAudio, PiperVoiceSpec } from './engine.js';

interface TensorLike {
  data: Float32Array | ArrayLike<number>;
}
export interface SessionLike {
  /** onnxruntime-web lists them; when present the config is checked against them on load. */
  readonly inputNames?: readonly string[];
  readonly outputNames?: readonly string[];
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
      try {
        checkModel(session, config);
        // A model and a config that do not belong together (a retrained voice with an old config) fail inside the
        // first run, long after loading: run the largest symbol id once now so the voice is refused up front.
        if (session.inputNames) await smoke(session, config, Tensor, multi);
      } catch (e) {
        void Promise.resolve(session.release?.()).catch(() => undefined);
        throw e;
      }

      return {
        config,
        async synthesize(text, { lengthScale }) {
          let ids: number[];
          if (phon) ids = phonemesToIds(phon.phonemize(config.espeak!.voice, text), config.phoneme_id_map);
          else {
            const t = textToIdsChecked(text, config.phoneme_id_map);
            // Dropping most of the letters speaks something else (or nothing): an error, so the phone's own voice speaks.
            if (t.letters > 0 && (t.letters - t.dropped) / t.letters <= MIN_KNOWN_SHARE) {
              throw new Error(`this voice does not know ${t.dropped} of the ${t.letters} letters and digits of "${text.slice(0, 40)}"`);
            }
            ids = t.ids;
          }
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

/** The model must take the inputs the config implies and produce an output. Throws a plain-words error. */
function checkModel(session: SessionLike, config: PiperConfig): void {
  const ins = session.inputNames;
  const outs = session.outputNames;
  if (ins) {
    for (const n of ['input', 'input_lengths', 'scales']) {
      if (!ins.includes(n)) throw new Error(`Piper model does not match its config: the model has no input "${n}" (inputs: ${ins.join(', ') || 'none'})`);
    }
    const multi = (config.num_speakers ?? 1) > 1;
    if (multi && !ins.includes('sid')) throw new Error('Piper model does not match its config: the config has several speakers but the model has no "sid" input');
    if (!multi && ins.includes('sid')) throw new Error('Piper model does not match its config: the model expects a speaker id but the config has one speaker');
  }
  if (outs && outs.length === 0) throw new Error('Piper model does not match its config: the model has no output');
}

async function smoke(session: SessionLike, config: PiperConfig, Tensor: OrtLike['Tensor'], multi: boolean): Promise<void> {
  const top = Math.max(0, ...Object.values(config.phoneme_id_map).flat());
  const ids = [top, 0];
  const feeds: Record<string, unknown> = {
    input: new Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
    input_lengths: new Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new Tensor('float32', Float32Array.from([config.inference.noise_scale, config.inference.length_scale, config.inference.noise_w]), [3]),
  };
  if (multi) feeds.sid = new Tensor('int64', BigInt64Array.from([0n]), [1]);
  try {
    const out = await session.run(feeds);
    if (!(out.output ?? Object.values(out)[0])) throw new Error('the model returned no audio');
  } catch (e) {
    throw new Error(`Piper model does not match its config (test run failed: ${e instanceof Error ? e.message : String(e)})`);
  }
}
