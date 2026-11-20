import { createWorkerEngines, type WorkerLike } from '../piper/worker-client.js';
import type { KokoroVoiceSpec } from './voices.js';

/**
 * onnxruntime-web threads for Kokoro: up to 4 when the page is cross-origin isolated (SharedArrayBuffer available,
 * e.g. a web host sending COOP/COEP headers), else 1. Piper always uses 1.
 */
export function kokoroThreads(g: { crossOriginIsolated?: boolean; navigator?: { hardwareConcurrency?: number } } = globalThis as never): number {
  if (!g.crossOriginIsolated) return 1;
  const cores = g.navigator?.hardwareConcurrency ?? 1;
  return Math.max(1, Math.min(4, Math.floor(cores)));
}

/**
 * The real Kokoro engines for a browser or WebView: one module Web Worker (bundled by Vite from ./worker.ts),
 * separate from Piper's. `assetBase` is where the espeak-ng phonemizer files are (the Piper runtime folder,
 * shared), `ortBase` where onnxruntime-web is.
 */
export function createKokoroWorkerEngines(assetBase: string, ortBase?: string, threads = kokoroThreads()): ReturnType<typeof createWorkerEngines<KokoroVoiceSpec>> {
  return createWorkerEngines<KokoroVoiceSpec>({
    assetBase,
    ortBase,
    threads,
    name: 'Kokoro',
    createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  });
}
