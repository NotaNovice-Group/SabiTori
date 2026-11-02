import { describe, expect, it, vi } from 'vitest';
import { createWorkerEngines, type WorkerLike } from '../src/index.js';

function fakeWorker() {
  const w = {
    sent: [] as any[],
    terminated: false,
    onmessage: null as WorkerLike['onmessage'],
    onerror: null as WorkerLike['onerror'],
    postMessage(m: any) {
      w.sent.push(m);
    },
    terminate() {
      w.terminated = true;
    },
    reply(r: any) {
      w.onmessage?.({ data: r });
    },
  };
  return w;
}
const voice = { id: 'fr:x', modelUrl: 'm.onnx', configUrl: 'm.onnx.json' };

describe('createWorkerEngines', () => {
  it('load and synthesize round-trip through one shared worker', async () => {
    const w = fakeWorker();
    const create = vi.fn(() => w as unknown as WorkerLike);
    const engines = createWorkerEngines({ createWorker: create, assetBase: 'http://x/piper/' });
    const a = engines(voice);
    const b = engines({ ...voice, id: 'en:y' });
    const loading = a.load();
    w.reply({ id: w.sent[0].id, ok: true });
    await loading;
    expect(w.sent[0]).toMatchObject({ type: 'load', voice, assetBase: 'http://x/piper/' });
    const p = b.synthesize('Hello.', { lengthScale: 0.8 });
    expect(w.sent[1]).toMatchObject({ type: 'synth', voiceId: 'en:y', text: 'Hello.', lengthScale: 0.8 });
    w.reply({ id: w.sent[1].id, ok: true, samples: new Float32Array(3), sampleRate: 16000 });
    expect((await p).sampleRate).toBe(16000);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('turns a worker error reply into a rejection', async () => {
    const w = fakeWorker();
    const engines = createWorkerEngines({ createWorker: () => w as unknown as WorkerLike, assetBase: '/p/' });
    const p = engines(voice).load();
    w.reply({ id: w.sent[0].id, ok: false, error: 'HTTP 404 for m.onnx' });
    await expect(p).rejects.toThrow('404');
  });

  it('a crashed worker rejects every pending call and the next call starts a fresh worker', async () => {
    const workers = [fakeWorker(), fakeWorker()];
    let n = 0;
    const engines = createWorkerEngines({ createWorker: () => workers[n++] as unknown as WorkerLike, assetBase: '/p/' });
    const p = engines(voice).load();
    workers[0]!.onerror?.({ message: 'wasm trap' });
    await expect(p).rejects.toThrow(/stopped/);
    expect(workers[0]!.terminated).toBe(true);
    const q = engines(voice).load();
    expect(workers[1]!.sent).toHaveLength(1);
    workers[1]!.reply({ id: workers[1]!.sent[0].id, ok: true });
    await q;
  });

  it('disposing the last voice terminates the worker (frees the model memory)', async () => {
    vi.useFakeTimers();
    const w = fakeWorker();
    const engines = createWorkerEngines({ createWorker: () => w as unknown as WorkerLike, assetBase: '/p/' });
    const e = engines(voice);
    const l = e.load();
    w.reply({ id: w.sent[0].id, ok: true });
    await l;
    e.dispose();
    await vi.advanceTimersByTimeAsync(5);
    expect(w.terminated).toBe(true);
    vi.useRealTimers();
  });
});
