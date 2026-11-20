import { voiceKey, type PiperAudio, type PiperEngine, type PiperVoiceSpec } from './engine.js';
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
export function createWorkerEngines<V extends PiperVoiceSpec = PiperVoiceSpec>(opts: {
  createWorker: () => WorkerLike;
  assetBase: string;
  ortBase?: string;
  /** Names the worker in error messages. Default "Piper". */
  name?: string;
  /** onnxruntime-web threads inside the worker. Default 1 (more needs a cross-origin isolated page). */
  threads?: number;
}): ((voice: V) => PiperEngine) & { terminate(): void } {
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
    failAll(`${opts.name ?? 'Piper'} worker stopped`);
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

  const factory = ((voice: V): PiperEngine => {
    const key = voiceKey(voice);
    return {
    async load() {
      const r = await call((id) => ({ id, type: 'load', voice, assetBase: opts.assetBase, ortBase: opts.ortBase, ...(opts.threads && opts.threads > 1 ? { threads: opts.threads } : {}) }));
      if (!r.ok) throw new Error(r.error);
      live.add(key);
    },
    /** False after the worker was stopped or crashed (it took every loaded model with it): the voice must be loaded again. */
    alive: () => live.has(key),
    async synthesize(text, { lengthScale }): Promise<PiperAudio> {
      const r = await call((id) => ({ id, type: 'synth', voiceId: key, text, lengthScale }));
      if (!r.ok) throw new Error(r.error);
      return { samples: r.samples ?? new Float32Array(0), sampleRate: r.sampleRate ?? 22050 };
    },
    dispose() {
      if (!live.delete(key) && !worker) return;
      void call((id) => ({ id, type: 'dispose', voiceId: key })).catch(() => undefined);
      if (live.size === 0) setTimeout(() => live.size === 0 && terminate(), 0);
    },
    };
  }) as ((voice: V) => PiperEngine) & { terminate(): void };
  factory.terminate = terminate;
  return factory;
}
