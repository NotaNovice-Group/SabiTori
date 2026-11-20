/**
 * Web Worker entry: runs onnxruntime-web (single thread, so no COOP/COEP is needed) and the espeak-ng
 * phonemizer off the UI thread. The app bundles this file with Vite; everything else it needs is plain
 * static files: the ORT wasm under `<ortBase>` (one copy shared with the MiniLM encoder, staged by
 * apps/app/vite.config.ts) and the trimmed espeak-ng wasm + data under `<assetBase>` (scripts/piper-assets.mjs). Nothing is fetched from a network origin other than the app's own.
 */
import { createPiperRuntime, type LoadedVoice, type OrtLike, type PhonemizerLike } from './runtime.js';
import { voiceKey } from './engine.js';
import { fetchBytes, loadOrt, loadPhonemizer, retryingOnce } from './worker-assets.js';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.js';

const scope = self as unknown as {
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

let assetBase = '';
let ortBase = '';
const voices = new Map<string, Promise<LoadedVoice>>();

const sharedPhonemizer = retryingOnce((): Promise<PhonemizerLike> => loadPhonemizer(assetBase));
const sharedOrt = retryingOnce((): Promise<OrtLike> => loadOrt(ortBase)); // a failure is tried again on the next load

scope.onmessage = (e) => {
  const msg = e.data;
  const reply = (r: WorkerResponse, transfer?: Transferable[]): void => scope.postMessage(r, transfer);
  const fail = (id: number, err: unknown): void => reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  void (async () => {
    try {
      if (msg.type === 'load') {
        assetBase = msg.assetBase;
        ortBase = msg.ortBase ?? msg.assetBase;
        const ort = await sharedOrt();
        const rt = createPiperRuntime({ ort, loadPhonemizer: sharedPhonemizer, fetchBytes });
        const p = rt.load(msg.voice);
        voices.set(voiceKey(msg.voice), p);
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
