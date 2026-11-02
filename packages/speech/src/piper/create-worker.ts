import { createWorkerEngines, type WorkerLike } from './worker-client.js';

/**
 * The real Piper engines for a browser or WebView: one module Web Worker (bundled by Vite from
 * ./worker.ts) that loads the espeak-ng files from `assetBase`
 * and onnxruntime-web from `ortBase` (default `assetBase`).
 */
export function createPiperWorkerEngines(assetBase: string, ortBase?: string): ReturnType<typeof createWorkerEngines> {
  return createWorkerEngines({
    assetBase,
    ortBase,
    createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  });
}

/** Piper needs a Worker, WebAssembly and Web Audio. Without them the system voice is used directly. */
export function piperSupported(): boolean {
  const g = globalThis as { Worker?: unknown; WebAssembly?: unknown; AudioContext?: unknown; webkitAudioContext?: unknown };
  return typeof g.Worker === 'function' && typeof g.WebAssembly === 'object' && (typeof g.AudioContext === 'function' || typeof g.webkitAudioContext === 'function');
}
