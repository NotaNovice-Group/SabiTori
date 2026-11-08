import { describe, expect, it, vi } from 'vitest';
import type { Classifier } from '@sabitori/core';
import { createEncoderController } from '../src/engine/encoder';

const rules: Classifier = {
  id: 'rules@1',
  classify: async () => ({ kind: 'water_bill', action: 'pay', urgency: 'soon', confidence: 0.7, producedBy: 'rules@1' }),
};
const input = { text: 'x', source: 'paste' as const, receivedAt: '2026-01-01', region: 'CM' };
const facts = { lang: 'fr' as const, dates: [], amounts: [], phones: [], references: [], urls: [], ussdCodes: [] };

describe('built-in encoder controller', () => {
  it('answers with the rules until the model has loaded, and does not load by itself', async () => {
    const c = createEncoderController(rules, './');
    expect(c.state().status).toBe('idle');
    expect(c.classifier.id).toBe('rules@1');
    expect((await c.classifier.classify(input, facts)).producedBy).toBe('rules@1');
    expect(c.state().status).toBe('idle');
  });
  it('stays on the rules and reports "failed" when the files cannot be loaded', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }));
    const c = createEncoderController(rules, './');
    const seen: string[] = [];
    c.subscribe((s) => seen.push(s.status));
    await c.init();
    expect(c.state().status).toBe('failed');
    expect(seen).toContain('loading');
    expect((await c.classifier.classify(input, facts)).kind).toBe('water_bill');
    vi.unstubAllGlobals();
  });
  it('tries again on a later init after a failure (for example once the network is back)', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => (calls++, new Response('nope', { status: 503 })));
    const c = createEncoderController(rules, './');
    await c.init();
    const first = calls;
    expect(first).toBeGreaterThan(0);
    await c.init();
    expect(calls).toBeGreaterThan(first);
    expect(c.state().status).toBe('failed');
    vi.unstubAllGlobals();
  });
});
