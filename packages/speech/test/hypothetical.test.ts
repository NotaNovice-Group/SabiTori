import { describe, expect, it } from 'vitest';
import type { PackRules } from '@sabitori/core';
import { assemble, moneyTokens, numberTokens, validateRules } from '../src/index.js';
import { enRules, frRules, loadRules } from './helpers.js';

/** HYPOTHETICAL language "Xan" (invented syllables, not a real language). Same JSON as docs/pack-rules.md. */
export const xan: PackRules = {
  formatVersion: 1,
  numbers: {
    atoms: { 0: 'nul', 1: 'ka', 2: 'lo', 3: 'mi', 4: 'su', 5: 'ne', 6: 'pa', 7: 'to', 8: 've', 9: 'ru' },
    joiners: { and: { text: 'ye' } },
    scales: [
      { value: 10, word: 'zan', omitOne: true, join: [{ token: 'and' }] },
      { value: 100, word: 'baro', omitOne: true, join: [{ token: 'and' }] },
      { value: 1000, word: 'toko', omitOne: true, join: [{ token: 'and' }] },
    ],
  },
  money: { template: '{currency} {amount}', currencies: { XAF: { text: 'fra' } } },
};

describe('hypothetical ten-and-three language', () => {
  const say = (n: number) => assemble(numberTokens(xan.numbers, n));
  it('validates', () => expect(() => validateRules(xan, 'xan')).not.toThrow());
  it.each([
    [7, 'to'], [10, 'zan'], [13, 'zan ye mi'], [20, 'lo zan'], [25, 'lo zan ye ne'], [100, 'baro'],
    [342, 'mi baro ye su zan ye lo'], [1000, 'toko'], [2015, 'lo toko ye zan ye ne'],
  ])('%i -> %s', (n, w) => expect(say(n)).toBe(w));
  it('number after noun money', () => {
    const t = moneyTokens(xan, { amount: 13, currency: 'XAF' });
    expect(assemble(t)).toBe('fra zan ye mi');
    expect(t.map((x) => x.id)).toEqual(['currency.XAF', 'scale.10', 'join.and', 'num.3']);
  });
});

describe('shipped rules validate', () => {
  it.each(['fr', 'en'])('%s', (tag) => expect(() => validateRules(loadRules(tag), tag)).not.toThrow());
  it('fixtures are the same files', () => {
    expect(frRules.formatVersion).toBe(1);
    expect(enRules.formatVersion).toBe(1);
  });
});
