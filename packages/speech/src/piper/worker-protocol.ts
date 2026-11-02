import type { PiperVoiceSpec } from './engine.js';

export type WorkerRequest =
  | { id: number; type: 'load'; voice: PiperVoiceSpec; assetBase: string; ortBase?: string }
  | { id: number; type: 'synth'; voiceId: string; text: string; lengthScale: number }
  | { id: number; type: 'dispose'; voiceId: string };

export type WorkerResponse = { id: number; ok: true; samples?: Float32Array; sampleRate?: number } | { id: number; ok: false; error: string };
