import { describe, expect, it } from 'vitest';
import type { LanguagePack } from '@sabitori/core';
import { numberTokens, requiredClips, moneyTokens, dateTokens } from '../src/index.js';
import { enRules, frRules, manifest, region, ttsPack } from './helpers.js';

const rec = (rules = enRules): LanguagePack => ({
  manifest: manifest('xx', { kind: 'recorded' }),
  rules,
  phrases: { 'about.bank': { text: 'b', status: 'draft', audio: [{ clip: 'p.b' }, { slot: 'x' }] }, 'scam.likely': { text: 's', status: 'draft', audio: [{ clip: 'p.a' }, { clip: 'p.b' }] } },
});

describe('requiredClips', () => {
  it('is empty for TTS packs', () => expect(requiredClips(ttsPack('fr', 'fr-FR', frRules, {}))).toEqual([]));
  it('is deterministic, sorted and unique', () => {
    const a = requiredClips(rec());
    const b = requiredClips({ ...rec(), phrases: Object.fromEntries(Object.entries(rec().phrases).reverse()) });
    expect(a).toEqual(b);
    expect(a).toEqual([...new Set(a)].sort());
    expect(a).toContain('p.a');
    expect(a.filter((c) => c === 'p.b')).toHaveLength(1);
  });
  it('lists atoms, scales, joiners, months, weekdays, relatives, currencies, words, senders', () => {
    const c = requiredClips(rec(), { region });
    for (const id of ['num.0', 'num.90', 'scale.100', 'scale.1000000', 'join.and', 'month.1', 'month.12', 'weekday.7', 'rel.tomorrow', 'currency.XAF', 'sender.mtn-momo']) {
      expect(c).toContain(id);
    }
    expect(c).not.toContain('join.hyphen');
    expect(c).not.toContain('pause.short');
    expect(requiredClips(rec())).not.toContain('sender.mtn-momo');
  });
  it.each([['en', enRules], ['fr', frRules]] as const)('covers every clip any %s token can need', (_t, rules) => {
    const need = new Set(requiredClips(rec(rules)));
    const check = (ts: { id: string | null; optional?: boolean }[]) => {
      for (const t of ts) if (t.id && !t.optional) expect(need.has(t.id), t.id).toBe(true);
    };
    for (let n = 0; n <= 2200; n++) check(numberTokens(rules.numbers, n));
    for (const n of [99999, 100000, 123456, 777777, 1000000, 80000000, 271828182, 999999999]) check(numberTokens(rules.numbers, n));
    check(moneyTokens(rules, { amount: 2000000, currency: 'XAF' }));
    for (let m = 1; m <= 12; m++) check(dateTokens(rules, `2027-${String(m).padStart(2, '0')}-0${m % 9 + 1}`, '2026-10-31'));
    check(dateTokens(rules, '2026-11-01', '2026-10-31'));
  });
});
