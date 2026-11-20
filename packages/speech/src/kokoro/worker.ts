/**
 * Kokoro Web Worker entry. Its own worker (not Piper's): when Kokoro is too slow on a phone the TTS backend stops
 * this worker, the stuck synthesis dies with it, and Piper keeps its worker free. Same protocol as the Piper worker
 * (piper/worker-protocol.ts), same onnxruntime-web and espeak-ng files (piper/worker-assets.ts).
 */
import { voiceKey } from '../piper/engine.js';
import type { OrtLike, PhonemizerLike } from '../piper/runtime.js';
import { fetchBytes, loadOrt, loadPhonemizer, retryingOnce } from '../piper/worker-assets.js';
import type { WorkerRequest, WorkerResponse } from '../piper/worker-protocol.js';
import { createKokoroRuntime, ortModelOpener, type LoadedKokoroVoice } from './runtime.js';
import type { KokoroVoiceSpec } from './voices.js';

const scope = self as unknown as {
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

let assetBase = '';
let ortBase = '';
const voices = new Map<string, Promise<LoadedKokoroVoice>>();
const sharedPhonemizer = retryingOnce((): Promise<PhonemizerLike> => loadPhonemizer(assetBase));
let threads = 1;
const sharedOrt = retryingOnce((): Promise<OrtLike> => loadOrt(ortBase, threads));
let runtime: ReturnType<typeof createKokoroRuntime> | null = null;

scope.onmessage = (e) => {
  const msg = e.data;
  const reply = (r: WorkerResponse, transfer?: Transferable[]): void => scope.postMessage(r, transfer);
  void (async () => {
    try {
      if (msg.type === 'load') {
        assetBase = msg.assetBase;
        ortBase = msg.ortBase ?? msg.assetBase;
        threads = msg.threads ?? 1; // read once: onnxruntime-web is set up by the first load
        const ort = await sharedOrt();
        // One runtime for the worker: every Kokoro voice shares the one loaded model.
        runtime ??= createKokoroRuntime({ loadPhonemizer: sharedPhonemizer, fetchBytes, openModel: ortModelOpener(ort, fetchBytes) });
        const key = voiceKey(msg.voice);
        const p = runtime.load(msg.voice as KokoroVoiceSpec);
        voices.set(key, p);
        p.catch(() => voices.get(key) === p && voices.delete(key));
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
      reply({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
};
