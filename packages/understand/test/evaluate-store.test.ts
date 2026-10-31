import { describe, expect, it } from 'vitest';
import { evaluate, isGgufBlob, modelStore, type EvalCase } from '../src/index.js';
import { fallbackWith, input } from './helpers.js';

const mk = (expected: EvalCase['expected']): EvalCase => ({ input: input('x'), expected });

describe('evaluate', () => {
  it('computes per-field accuracy and confusion', async () => {
    const clf = fallbackWith({ kind: 'bank', action: 'pay', urgency: 'info', confidence: 0.6 });
    const r = await evaluate(clf, [
      mk({ kind: 'bank', action: 'pay', urgency: 'info' }),
      mk({ kind: 'health', action: 'pay', urgency: 'urgent' }),
      mk({ kind: 'bank' }),
    ]);
    expect(r.total).toBe(3);
    expect(r.accuracy.kind).toBeCloseTo(2 / 3);
    expect(r.accuracy.action).toBe(1);
    expect(r.accuracy.urgency).toBe(0.5);
    expect(r.accuracyAll).toBeCloseTo(2 / 3);
    expect(r.confusion.kind.health).toEqual({ bank: 1 });
    expect(r.failures).toHaveLength(1);
    expect(r.meanConfidence).toBeCloseTo(0.6);
  });
  it('counts thrown errors as wrong', async () => {
    const r = await evaluate({ id: 'x', classify: async () => { throw new Error('x'); } }, [mk({ kind: 'bank' })]);
    expect(r.errors).toBe(1);
    expect(r.accuracy.kind).toBe(0);
  });
  it('handles empty set', async () => {
    expect((await evaluate(fallbackWith(), [])).accuracyAll).toBe(0);
  });
});

describe('model store', () => {
  it('detects GGUF magic', async () => {
    expect(await isGgufBlob(new Blob(['GGUF\x03\x00\x00\x00']))).toBe(true);
    expect(await isGgufBlob(new Blob(['PK\x03\x04aaaaaaa']))).toBe(false);
    expect(await isGgufBlob(new Blob(['GG']))).toBe(false);
  });
  it('degrades without OPFS', async () => {
    expect(await modelStore.has()).toBe(false);
    expect(await modelStore.load()).toBeNull();
    await expect(modelStore.remove()).resolves.toBeUndefined();
    await expect(modelStore.save(new Blob(['GGUF\x03\x00\x00\x00']))).rejects.toMatchObject({ code: 'unavailable' });
    await expect(modelStore.save(new Blob(['nope nope nope']))).rejects.toMatchObject({ code: 'not_gguf' });
  });
});
