import type { PiperAudio, PiperEngine, PiperEngineFactory, PiperVoiceSpec } from './engine.js';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

export interface WorkerLike {
  postMessage(msg: WorkerRequest): void;
  terminate(): void;
  onmessage: ((e: { data: WorkerResponse }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

/**
 * Engines that run in one shared Web Worker (one worker, so the ORT runtime and the espeak-ng
 * phonemizer are loaded once however many voices are used). `createWorker` is the app's
 * `() => new Worker(new URL('.../worker.ts', import.meta.url), { type: 'module' })`.
 * `assetBase` is an absolute URL ending in "/" where the espeak-ng wasm and data are served; `ortBase` is where the
 * onnxruntime-web files are (the app shares one copy with the encoder; defaults to `assetBase`).
 */
export function createWorkerEngines(opts: { createWorker: () => WorkerLike; assetBase: string; ortBase?: string }): PiperEngineFactory & { terminate(): void } {
  let worker: WorkerLike | null = null;
  let seq = 0;
  const pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();
  const live = new Set<string>();

  const failAll = (msg: string): void => {
    for (const p of pending.values()) p.reject(new Error(msg));
    pending.clear();
  };
  const terminate = (): void => {
    worker?.terminate();
    worker = null;
    live.clear();
    failAll('Piper worker stopped');
  };
  const get = (): WorkerLike => {
    if (worker) return worker;
    const w = opts.createWorker();
    w.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data);
    };
    w.onerror = (e) => {
      if (worker === w) terminate();
      else failAll(e.message ?? 'worker error');
    };
    worker = w;
    return w;
  };
  const call = (build: (id: number) => WorkerRequest): Promise<WorkerResponse> =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      try {
        get().postMessage(build(id));
      } catch (e) {
        pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

  const factory = ((voice: PiperVoiceSpec): PiperEngine => ({
    async load() {
      const r = await call((id) => ({ id, type: 'load', voice, assetBase: opts.assetBase, ortBase: opts.ortBase }));
      if (!r.ok) throw new Error(r.error);
      live.add(voice.id);
    },
    async synthesize(text, { lengthScale }): Promise<PiperAudio> {
      const r = await call((id) => ({ id, type: 'synth', voiceId: voice.id, text, lengthScale }));
      if (!r.ok) throw new Error(r.error);
      return { samples: r.samples ?? new Float32Array(0), sampleRate: r.sampleRate ?? 22050 };
    },
    dispose() {
      if (!live.delete(voice.id) && !worker) return;
      void call((id) => ({ id, type: 'dispose', voiceId: voice.id })).catch(() => undefined);
      if (live.size === 0) setTimeout(() => live.size === 0 && terminate(), 0);
    },
  })) as PiperEngineFactory & { terminate(): void };
  factory.terminate = terminate;
  return factory;
}
