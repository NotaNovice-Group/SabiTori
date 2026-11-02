/**
 * Web Worker entry: runs onnxruntime-web (single thread, so no COOP/COEP is needed) and the espeak-ng
 * phonemizer off the UI thread. The app bundles this file with Vite; everything else it needs is plain
 * static files: the ORT wasm under `<ortBase>` (one copy shared with the MiniLM encoder, staged by
 * apps/app/vite.config.ts) and the trimmed espeak-ng wasm + data under `<assetBase>` (scripts/piper-assets.mjs). Nothing is fetched from a network origin other than the app's own.
 */
import { createPiperRuntime, type LoadedVoice, type OrtLike, type PhonemizerLike } from './runtime.js';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

interface EmscriptenModule {
  callMain(args: string[]): void;
}
type CreatePhonemize = (opts: Record<string, unknown>) => Promise<EmscriptenModule>;

const scope = self as unknown as {
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

let assetBase = '';
let ortBase = '';
const voices = new Map<string, Promise<LoadedVoice>>();

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadOrt(): Promise<OrtLike> {
  const ort = (await import(/* @vite-ignore */ `${ortBase}ort.wasm.min.mjs`)) as unknown as OrtLike & { env: { wasm: Record<string, unknown> } };
  ort.env.wasm.wasmPaths = ortBase;
  ort.env.wasm.numThreads = 1; // single thread: works without cross-origin isolation
  ort.env.wasm.proxy = false;
  return ort;
}

async function loadPhonemizer(): Promise<PhonemizerLike> {
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

let phonemizerP: Promise<PhonemizerLike> | null = null;
const sharedPhonemizer = (): Promise<PhonemizerLike> => (phonemizerP ??= loadPhonemizer().catch((e) => {
  phonemizerP = null;
  throw e;
}));
let ortP: Promise<OrtLike> | null = null;

scope.onmessage = (e) => {
  const msg = e.data;
  const reply = (r: WorkerResponse, transfer?: Transferable[]): void => scope.postMessage(r, transfer);
  const fail = (id: number, err: unknown): void => reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  void (async () => {
    try {
      if (msg.type === 'load') {
        assetBase = msg.assetBase;
        ortBase = msg.ortBase ?? msg.assetBase;
        ortP ??= loadOrt();
        const ort = await ortP;
        const rt = createPiperRuntime({ ort, loadPhonemizer: sharedPhonemizer, fetchBytes });
        const p = rt.load(msg.voice);
        voices.set(msg.voice.id, p);
        await p;
        reply({ id: msg.id, ok: true });
      } else if (msg.type === 'synth') {
        const v = await voices.get(msg.voiceId);
        if (!v) throw new Error('voice not loaded');
        const a = await v.synthesize(msg.text, { lengthScale: msg.lengthScale });
        reply({ id: msg.id, ok: true, samples: a.samples, sampleRate: a.sampleRate }, [a.samples.buffer]);
      } else if (msg.type === 'dispose') {
        const v = await voices.get(msg.voiceId)?.catch(() => undefined);
        voices.delete(msg.voiceId);
        v?.release();
        reply({ id: msg.id, ok: true });
      }
    } catch (err) {
      fail(msg.id, err);
    }
  })();
};
