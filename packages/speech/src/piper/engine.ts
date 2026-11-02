/** What the Piper TTS backend needs from an inference engine. The real one runs in a Web Worker; tests use fakes. */

export interface PiperVoiceSpec {
  /** Model id, e.g. "fr_FR-siwis-low". Also the cache key. */
  id: string;
  modelUrl: string;
  configUrl: string;
}

export interface PiperAudio {
  samples: Float32Array;
  sampleRate: number;
}

export interface PiperEngine {
  /** Fetches the config and model and creates the inference session. Rejects when anything is missing or invalid. */
  load(): Promise<void>;
  /** `lengthScale` multiplies the model's own length_scale: 1 = as trained, 2 = half speed. */
  synthesize(text: string, opts: { lengthScale: number }): Promise<PiperAudio>;
  /** Frees the model. A pending call may never resolve afterwards. */
  dispose(): void;
}

export type PiperEngineFactory = (voice: PiperVoiceSpec) => PiperEngine;
