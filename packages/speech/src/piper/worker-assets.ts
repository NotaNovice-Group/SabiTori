/**
 * What the Piper and Kokoro workers load the same way: onnxruntime-web from `<ortBase>` (one copy shared with the
 * MiniLM encoder, staged by apps/app/vite.config.ts) and the trimmed espeak-ng phonemizer from `<assetBase>`
 * (scripts/piper-assets.mjs). Only runs inside a Web Worker; nothing is fetched from another origin.
 */
import type { OrtLike, PhonemizerLike } from './runtime.js';

interface EmscriptenModule {
  callMain(args: string[]): void;
}
type CreatePhonemize = (opts: Record<string, unknown>) => Promise<EmscriptenModule>;

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** `threads` > 1 needs SharedArrayBuffer (a cross-origin isolated page); the caller checks. Default 1. */
export async function loadOrt(ortBase: string, threads = 1): Promise<OrtLike> {
  const ort = (await import(/* @vite-ignore */ `${ortBase}ort.wasm.min.mjs`)) as unknown as OrtLike & { env: { wasm: Record<string, unknown> } };
  ort.env.wasm.wasmPaths = ortBase;
  ort.env.wasm.numThreads = Math.max(1, Math.floor(threads)); // 1: works without cross-origin isolation
  ort.env.wasm.proxy = false;
  // Fetch the wasm ourselves: a failed download (network lost on a first web visit) is then a normal,
  // catchable error here instead of an uncaught "Aborted(NetworkError ...)" from inside the runtime.
  ort.env.wasm.wasmBinary = (await fetchBytes(`${ortBase}ort-wasm-simd-threaded.wasm`)).buffer;
  return ort;
}

export async function loadPhonemizer(assetBase: string): Promise<PhonemizerLike> {
  const mod = (await import(/* @vite-ignore */ `${assetBase}piper_phonemize.mjs`)) as { default: CreatePhonemize };
  let lines: string[] = [];
  const errors: string[] = [];
  const m = await mod.default({
    noInitialRun: true,
    print: (d: string) => lines.push(d),
    printErr: (e: string) => errors.push(e),
    locateFile: (f: string) => `${assetBase}${f}`,
  });
  return {
    phonemize(voice, text) {
      lines = [];
      errors.length = 0;
      m.callMain(['-l', voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
      const line = lines.find((l) => l.startsWith('{'));
      if (!line) throw new Error(`espeak-ng produced no output: ${errors.join(' ').slice(0, 200)}`);
      return (JSON.parse(line) as { phonemes: string[] }).phonemes;
    },
  };
}

/** A promise cache that forgets a failure, so the next call tries again. */
export function retryingOnce<T>(make: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= make().catch((e) => {
    p = null;
    throw e;
  }));
}
