import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import { createRulesClassifier } from '@sabitori/core';
import type { Classifier, Understanding } from '@sabitori/core';
import {
  applyHead, applyHeads, combineWithRules, createEncoderClassifier, l2normalise, loadEncoder, softmax,
  MAX_ENCODER_CONFIDENCE, ENCODER_ID, type Encoder, type EncoderLabels, type HeadsFile,
} from '../src/index.js';
import { facts, input } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const modelDir = resolve(here, '../model/minilm');
const haveModel = existsSync(resolve(modelDir, 'encoder.int8.onnx'));
const readFile = async (n: string) => new Uint8Array(readFileSync(resolve(modelDir, n)));

const rulesU = (u: Partial<Understanding> = {}): Understanding => ({
  kind: 'other', action: 'unclear', urgency: 'info', confidence: 0.5, producedBy: 'rules@1', ...u,
});
const labels = (k: [string, number], a: [string, number], u: [string, number]): EncoderLabels => ({
  kind: { label: k[0], p: k[1], probs: [] }, action: { label: a[0], p: a[1], probs: [] }, urgency: { label: u[0], p: u[1], probs: [] },
});

describe('head maths', () => {
  it('softmax sums to 1 and temperature flattens it', () => {
    const p = softmax([2, 1, 0]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(p[0]).toBeGreaterThan(p[1]!);
    expect(softmax([2, 1, 0], 4)[0]!).toBeLessThan(p[0]!);
    expect(softmax([1000, 0])[0]).toBeCloseTo(1, 10); // no overflow
  });
  it('l2normalise gives unit length and survives zero', () => {
    const v = l2normalise([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect(Array.from(l2normalise([0, 0]))).toEqual([0, 0]);
  });
  it('applyHead is argmax(Wx+b) with calibrated probability', () => {
    const h = { labels: ['a', 'b', 'c'], W: [[1, 0], [0, 1], [-1, -1]], b: [0, 0.5, 0], temperature: 1 };
    const r = applyHead([0.2, 1], h);
    expect(r.label).toBe('b');
    const logits = [0.2, 1.5, -1.2];
    expect(r.p).toBeCloseTo(softmax(logits)[1]!, 10);
    expect(applyHead([0.2, 1], { ...h, temperature: 3 }).p).toBeLessThan(r.p);
  });
  it('applyHeads normalises and checks the dimension', () => {
    const mk = (labels: string[]) => ({ labels, W: labels.map((_, i) => [i === 0 ? 1 : 0, i === 1 ? 1 : 0]), b: labels.map(() => 0), temperature: 1 });
    const f: HeadsFile = { version: 1, dim: 2, normalise: true, heads: { kind: mk(['x', 'y']), action: mk(['x', 'y']), urgency: mk(['x', 'y']) } };
    expect(applyHeads([5, 1], f).kind.label).toBe('x');
    expect(applyHeads([1, 5], f).kind.label).toBe('y');
    expect(() => applyHeads([1, 2, 3], f)).toThrow(/expect 2/);
  });
});

describe('threshold and combination with rules', () => {
  const rules = rulesU({ kind: 'bank', action: 'nothing', urgency: 'info', confidence: 0.7 });
  it('takes the rules unchanged when the encoder is unsure everywhere', () => {
    expect(combineWithRules(labels(['health', 0.4], ['pay', 0.5], ['urgent', 0.3]), rules, 0.6, 'enc')).toBe(rules);
  });
  it('takes the encoder label per field only at or above the threshold', () => {
    const u = combineWithRules(labels(['health', 0.9], ['pay', 0.5], ['urgent', 0.6]), rules, 0.6, 'enc');
    expect([u.kind, u.action, u.urgency]).toEqual(['health', 'nothing', 'urgent']);
    expect(u.producedBy).toBe('enc');
  });
  it('confidence is the lowest among the sources used, and capped', () => {
    const u = combineWithRules(labels(['health', 0.99], ['pay', 0.99], ['urgent', 0.99]), rules, 0.6, 'enc');
    expect(u.confidence).toBe(MAX_ENCODER_CONFIDENCE);
    const mixed = combineWithRules(labels(['health', 0.9], ['pay', 0.2], ['urgent', 0.2]), rulesU({ confidence: 0.3 }), 0.6, 'enc');
    expect(mixed.confidence).toBe(0.3); // leans on an unsure rule match: card falls back to facts only
  });
  it('never produces anything but labels', () => {
    const u = combineWithRules(labels(['health', 0.9], ['pay', 0.9], ['urgent', 0.9]), rules, 0.6, 'enc');
    expect(Object.keys(u).sort()).toEqual(['action', 'confidence', 'kind', 'producedBy', 'urgency']);
  });
});

describe.skipIf(!haveModel)('tokenizer parity with Python (20 strings) and the int8 encoder', () => {
  type Case = { text: string; ids: number[]; embedding?: number[] };
  const fx = JSON.parse(readFileSync(resolve(here, 'fixtures/encoder-parity.json'), 'utf8')) as { cases: Case[] };
  let enc: Encoder;
  beforeAll(async () => { enc = await loadEncoder({ baseUrl: modelDir, readFile }); }, 60_000);

  it('has 20 cases', () => expect(fx.cases.length).toBe(20));
  it.each(fx.cases.map((c, i) => [i, c] as const))('case %i: same token ids as the Python tokenizer', (_i, c) => {
    expect(enc.tokenize(c.text)).toEqual(c.ids);
  });
  it('embeddings match Python onnxruntime (cosine; dynamic int8 kernels differ in the last bits)', async () => {
    for (const c of fx.cases.filter((x) => x.embedding)) {
      const v = await enc.embed(c.text);
      expect(v.length).toBe(384);
      const r = c.embedding!;
      let d = 0, a = 0, b = 0;
      for (let i = 0; i < 384; i++) { d += v[i]! * r[i]!; a += v[i]! * v[i]!; b += r[i]! * r[i]!; }
      expect(d / Math.sqrt(a * b)).toBeGreaterThan(0.99);
    }
  }, 60_000);
});

describe.skipIf(!haveModel)('end to end in Node: 5 messages', () => {
  const rules: Classifier = createRulesClassifier({ currency: 'XAF', officialSenders: [] } as never, []);
  const msgs = [
    'Votre facture ENEO de 24 500 FCFA est disponible. Payez avant le 20/03 pour éviter la coupure.',
    'You have received 5,000 XAF from Mary. New balance 21,000 XAF. MTN MoMo.',
    'Hôpital Laquintinie: rendez-vous demain à 8h au service de pédiatrie. Apportez le carnet.',
    'Lycée Leclerc: les frais de scolarité de 50 000 FCFA sont dus avant le 30/09.',
    'Camwater: facture d’eau de 6 200 FCFA, date limite le 10/04.',
  ];
  it('returns valid closed-list labels, an id, and a confidence in 0..1 for each', async () => {
    const { MESSAGE_KINDS, ACTION_KINDS, URGENCIES } = await import('@sabitori/core');
    const cls = await createEncoderClassifier({ baseUrl: modelDir, fallback: rules, threshold: 0, readFile });
    expect(cls.id).toBe(ENCODER_ID);
    for (const m of msgs) {
      const u = await cls.classify(input(m), facts());
      expect(MESSAGE_KINDS).toContain(u.kind);
      expect(ACTION_KINDS).toContain(u.action);
      expect(URGENCIES).toContain(u.urgency);
      expect(u.confidence).toBeGreaterThan(0);
      expect(u.confidence).toBeLessThanOrEqual(1);
      expect(u.producedBy).toBe(ENCODER_ID);
    }
  }, 120_000);
  it('falls back to the rules when the model fails to run', async () => {
    const fb = { id: 'rules@1', classify: async () => rulesU({ kind: 'water_bill' }) } as Classifier;
    const cls = await createEncoderClassifier({
      baseUrl: modelDir, fallback: fb, readFile,
      ort: { // a runtime whose sessions always throw
        InferenceSession: { create: async () => ({ run: async () => { throw new Error('boom'); } }) },
        Tensor: class { constructor(public t: string, public d: unknown, public s: number[]) {} } as never,
      },
    });
    expect((await cls.classify(input('x'), facts())).kind).toBe('water_bill');
  });
  it('rejects heads whose labels differ from the closed lists in core', async () => {
    const bad = JSON.parse(readFileSync(resolve(modelDir, 'heads.json'), 'utf8'));
    bad.heads.kind.labels = ['nope'];
    await expect(loadEncoder({ baseUrl: modelDir, readFile: async (n) => n === 'heads.json' ? new TextEncoder().encode(JSON.stringify(bad)) : readFile(n) })).rejects.toThrow(/closed list/);
  });
});
