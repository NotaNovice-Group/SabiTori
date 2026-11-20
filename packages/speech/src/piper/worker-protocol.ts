import type { PiperVoiceSpec } from './engine.js';

export type WorkerRequest =
  | { id: number; type: 'load'; voice: PiperVoiceSpec; assetBase: string; ortBase?: string; /** onnxruntime-web threads (default 1; more only when the page is cross-origin isolated). */ threads?: number }
  /** voiceId is the voice's key: id and version (see voiceKey). */
  | { id: number; type: 'synth'; voiceId: string; text: string; lengthScale: number }
  | { id: number; type: 'dispose'; voiceId: string };

export type WorkerResponse = { id: number; ok: true; samples?: Float32Array; sampleRate?: number } | { id: number; ok: false; error: string };
