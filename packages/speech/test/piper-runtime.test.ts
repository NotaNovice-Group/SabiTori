import { describe, expect, it, vi } from 'vitest';
import { createPiperRuntime, type OrtLike, type PhonemizerLike } from '../src/index.js';

const enc = (o: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(o));
const MAP = { _: [0], '^': [1], $: [2], ' ': [3], a: [4], b: [5] };

function fakeOrt(): { ort: OrtLike; runs: Array<Record<string, { type: string; data: unknown }>> } {
  const runs: Array<Record<string, { type: string; data: unknown }>> = [];
  class Tensor {
    constructor(public type: string, public data: unknown, public dims?: number[]) {}
  }
  const ort: OrtLike = {
    InferenceSession: {
      async create() {
        return {
          async run(feeds) {
            runs.push(feeds as never);
            return { output: { data: new Float32Array([0.1, -0.1, 0.2]) } };
          },
        };
      },
    },
    Tensor: Tensor as never,
  };
  return { ort, runs };
}

describe('createPiperRuntime', () => {
  it('espeak models: loads the phonemizer once, maps phonemes to ids and scales length by the model default', async () => {
    const { ort, runs } = fakeOrt();
    const phon: PhonemizerLike = { phonemize: vi.fn(() => ['a', 'b']) };
    const loadPhonemizer = vi.fn(async () => phon);
    const cfg = { audio: { sample_rate: 22050 }, espeak: { voice: 'en-gb-x-rp' }, inference: { noise_scale: 0.7, length_scale: 1.2, noise_w: 0.8 }, phoneme_id_map: MAP };
    const rt = createPiperRuntime({ ort, loadPhonemizer, fetchBytes: async (u) => (u.endsWith('.json') ? enc(cfg) : new Uint8Array(4)) });
    const a = await rt.load({ id: 'x', modelUrl: 'm.onnx', configUrl: 'm.onnx.json' });
    const b = await rt.load({ id: 'y', modelUrl: 'm.onnx', configUrl: 'm.onnx.json' });
    expect(loadPhonemizer).toHaveBeenCalledTimes(1);
    const out = await a.synthesize('ab', { lengthScale: 0.5 });
    await b.synthesize('ab', { lengthScale: 1 });
    expect(phon.phonemize).toHaveBeenCalledWith('en-gb-x-rp', 'ab');
    expect(out.sampleRate).toBe(22050);
    expect(out.samples.length).toBe(3);
    expect(Array.from(runs[0]!.input!.data as BigInt64Array)).toEqual([1n, 0n, 4n, 0n, 5n, 0n, 2n]);
    const scales = Array.from(runs[0]!.scales!.data as Float32Array);
    expect(scales[1]).toBeCloseTo(0.6, 5); // 1.2 * 0.5
    expect(runs[0]!.sid).toBeUndefined();
  });

  it('phoneme_type "text" never loads the phonemizer', async () => {
    const { ort, runs } = fakeOrt();
    const loadPhonemizer = vi.fn(async () => {
      throw new Error('should not load');
    });
    const cfg = { audio: { sample_rate: 16000 }, phoneme_type: 'text', inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 }, phoneme_id_map: MAP, num_speakers: 2 };
    const rt = createPiperRuntime({ ort, loadPhonemizer, fetchBytes: async (u) => (u.endsWith('.json') ? enc(cfg) : new Uint8Array(4)) });
    const v = await rt.load({ id: 't', modelUrl: 'm.onnx', configUrl: 'm.onnx.json' });
    await v.synthesize('a b', { lengthScale: 1 });
    expect(loadPhonemizer).not.toHaveBeenCalled();
    expect(Array.from(runs[0]!.input!.data as BigInt64Array)).toEqual([1n, 0n, 4n, 0n, 3n, 0n, 5n, 0n, 2n]);
    expect(runs[0]!.sid).toBeDefined(); // multi-speaker models get speaker 0
  });

  it('returns silence for text the model knows nothing of, without running the model', async () => {
    const { ort, runs } = fakeOrt();
    const cfg = { audio: { sample_rate: 16000 }, phoneme_type: 'text', inference: { noise_scale: 1, length_scale: 1, noise_w: 1 }, phoneme_id_map: MAP };
    const rt = createPiperRuntime({ ort, loadPhonemizer: async () => ({ phonemize: () => [] }), fetchBytes: async (u) => (u.endsWith('.json') ? enc(cfg) : new Uint8Array(4)) });
    const v = await rt.load({ id: 't', modelUrl: 'm', configUrl: 'c.json' });
    expect((await v.synthesize('???', { lengthScale: 1 })).samples.length).toBe(0);
    expect(runs).toHaveLength(0);
  });

  it('rejects when the model or config cannot be fetched', async () => {
    const { ort } = fakeOrt();
    const rt = createPiperRuntime({ ort, loadPhonemizer: async () => ({ phonemize: () => [] }), fetchBytes: async (u) => { throw new Error(`HTTP 404 for ${u}`); } });
    await expect(rt.load({ id: 'z', modelUrl: 'm', configUrl: 'c' })).rejects.toThrow(/404/);
  });
});
