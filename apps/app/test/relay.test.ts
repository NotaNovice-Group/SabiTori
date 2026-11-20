import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPackRegistry } from '@sabitori/speech';
import type { ReadingLexicon, RegionConfig } from '@sabitori/core';
import { createEngineFrom } from '../src/engine/packages-engine';
import { decide, LIMITS, newRelayState, relayEnabled, relayReply } from '../src/lib/relay';
import { isGsm7 } from '@sabitori/gateway/compose';

const root = resolve(__dirname, '../../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const diskFetch = async (url: string) => {
  const file = resolve(root, url.replace(/^\//, ''));
  if (!existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
};
const engine = () =>
  createEngineFrom({
    region: json('regions/CM/region.json') as RegionConfig,
    registry: createPackRegistry({ baseUrl: '/packs', fetch: diskFetch }),
    lexicons: ['fr', 'en'].map((t) => json(`packs/${t}/reading.json`)) as ReadingLexicon[],
    baseUrl: './',
    today: () => '2026-11-20',
    player: { play: () => {}, stop() {}, playing: false },
  });

describe('relay: who gets an answer', () => {
  it('answers ordinary Cameroonian mobile numbers, in any common writing', () => {
    const s = newRelayState();
    for (const f of ['+237677123456', '237690112233', '00237655443322', '699887766'])
      expect(decide(f, 'hello', s, 0)).toMatchObject({ ok: true });
  });
  it('never answers a short code, a company name or a foreign number (no loops, no international charges)', () => {
    const s = newRelayState();
    for (const f of ['8104', 'MTN', 'ENEO', '+33612345678', '+237222233068'])
      expect(decide(f, 'hello', s, 0)).toEqual({ ok: false, why: 'not_mobile' });
  });
  it('limits one number per hour, and the whole relay per hour', () => {
    const s = newRelayState();
    for (let i = 0; i < LIMITS.perNumberPerHour; i++) expect(decide('677123456', 'x', s, 1000 + i).ok).toBe(true);
    expect(decide('677123456', 'x', s, 2000)).toEqual({ ok: false, why: 'number_limit' });
    expect(decide('677123456', 'x', s, 1000 + 3_600_001 + LIMITS.perNumberPerHour).ok).toBe(true);
    const g = newRelayState();
    for (let i = 0; i < LIMITS.perHour; i++) expect(decide(`6770${String(i).padStart(5, '0')}`, 'x', g, i).ok).toBe(true);
    expect(decide('699999999', 'x', g, 100)).toEqual({ ok: false, why: 'hour_limit' });
  });
  it('refuses empty and oversized texts', () => {
    expect(decide('677123456', '  ', newRelayState(), 0)).toEqual({ ok: false, why: 'empty' });
    expect(decide('677123456', 'a'.repeat(LIMITS.maxChars + 1), newRelayState(), 0)).toEqual({ ok: false, why: 'too_long' });
  });
  it('exists only in the relay build', () => {
    expect(relayEnabled({ VITE_RELAY: '1' })).toBe(true);
    expect(relayEnabled({})).toBe(false);
  });
});

describe('relay: the reply', () => {
  it('a forwarded scam: the warning first, no amount, at most 3 SMS, GSM-7', async () => {
    const r = await relayReply(engine(), 'Félicitations! Votre numéro a gagné 500 000 FCFA. Envoyez 5 000 FCFA de frais au 677 12 34 56.', '2026-11-20');
    expect(r.scam).toBe('likely_scam');
    expect(r.text.split('\n')[1]).toMatch(/piège|piege/);
    expect(r.text).not.toMatch(/cinq cent mille|500 000/);
    expect(r.parts).toBeLessThanOrEqual(3);
    expect(isGsm7(r.text)).toBe(true);
  });
  it('a bill in English when asked', async () => {
    const r = await relayReply(engine(), "EN ENEO: Votre facture d'électricité de 18 450 FCFA est à payer avant le 30/11/2026.", '2026-11-20');
    expect(r.text).toMatch(/^SabiTori:/);
    expect(r.text).toMatch(/eighteen thousand/);
  });
});
