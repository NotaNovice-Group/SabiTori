/** What the Piper TTS backend needs from an inference engine. The real one runs in a Web Worker; tests use fakes. */

export interface PiperVoiceSpec {
  /** Model id, e.g. "fr_FR-siwis-low". Also the cache key. */
  id: string;
  modelUrl: string;
  configUrl: string;
  /**
   * Version of the voice files (the pack's manifest version). It is part of every cache key, so a voice retrained
   * under the same id never pairs an old loaded model with a new config, and a voice marked broken stays broken
   * only until its version changes.
   */
  version?: string;
}

/** The key under which a voice's loaded model, synthesized audio and broken-state are remembered: id and version. */
export const voiceKey = (v: Pick<PiperVoiceSpec, 'id' | 'version'>): string => (v.version ? `${v.id}@${v.version}` : v.id);

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
  /**
   * False when the loaded model is gone, for example the worker that held it crashed and was restarted.
   * The TTS backend then loads the voice again instead of failing every utterance. Absent: always alive.
   */
  alive?(): boolean;
}

export type PiperEngineFactory = (voice: PiperVoiceSpec) => PiperEngine;
