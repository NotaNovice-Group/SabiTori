import { describe, expect, it } from 'vitest';
import { sayEn, sayFr } from './helpers.js';
import { numberTokens } from '../src/index.js';
import { frRules } from './helpers.js';

const FR: [number, string][] = [
  [0, 'zéro'], [1, 'un'], [2, 'deux'], [7, 'sept'], [10, 'dix'], [11, 'onze'], [16, 'seize'], [17, 'dix-sept'], [19, 'dix-neuf'],
  [20, 'vingt'], [21, 'vingt et un'], [22, 'vingt-deux'], [30, 'trente'], [31, 'trente et un'], [45, 'quarante-cinq'],
  [51, 'cinquante et un'], [59, 'cinquante-neuf'], [60, 'soixante'], [61, 'soixante et un'], [66, 'soixante-six'],
  [70, 'soixante-dix'], [71, 'soixante et onze'], [72, 'soixante-douze'], [77, 'soixante-dix-sept'], [79, 'soixante-dix-neuf'],
  [80, 'quatre-vingts'], [81, 'quatre-vingt-un'], [85, 'quatre-vingt-cinq'], [90, 'quatre-vingt-dix'], [91, 'quatre-vingt-onze'],
  [92, 'quatre-vingt-douze'], [99, 'quatre-vingt-dix-neuf'],
  [100, 'cent'], [101, 'cent un'], [111, 'cent onze'], [121, 'cent vingt et un'], [171, 'cent soixante et onze'],
  [180, 'cent quatre-vingts'], [199, 'cent quatre-vingt-dix-neuf'],
  [200, 'deux cents'], [201, 'deux cent un'], [280, 'deux cent quatre-vingts'], [300, 'trois cents'], [999, 'neuf cent quatre-vingt-dix-neuf'],
  [1000, 'mille'], [1001, 'mille un'], [1100, 'mille cent'], [1980, 'mille neuf cent quatre-vingts'], [2000, 'deux mille'],
  [2027, 'deux mille vingt-sept'], [15000, 'quinze mille'], [21000, 'vingt et un mille'], [71000, 'soixante et onze mille'],
  [80000, 'quatre-vingt mille'], [81000, 'quatre-vingt-un mille'], [100000, 'cent mille'], [200000, 'deux cent mille'],
  [280000, 'deux cent quatre-vingt mille'], [999999, 'neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf'],
  [1000000, 'un million'], [2000000, 'deux millions'], [1000001, 'un million un'], [80000000, 'quatre-vingts millions'],
  [200000000, 'deux cents millions'], [200000001, 'deux cents millions un'], [999999999, 'neuf cent quatre-vingt-dix-neuf millions neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf'],
  [1000000000, 'un milliard'],
];

describe('French numbers', () => {
  it('has at least 60 table values', () => expect(FR.length).toBeGreaterThanOrEqual(60));
  it.each(FR)('%i -> %s', (n, words) => expect(sayFr(n)).toBe(words));
  it('rejects negatives and fractions', () => {
    expect(() => sayFr(-1)).toThrow();
    expect(() => sayFr(1.5)).toThrow();
  });
  it('reads numbers above the supported range digit by digit', () => {
    expect(sayFr(1e12)).toBe('un zéro zéro zéro zéro zéro zéro zéro zéro zéro zéro zéro zéro');
  });
  it('produces clip ids per token', () => {
    const ids = numberTokens(frRules.numbers, 71_000).map((t) => t.id);
    expect(ids).toEqual(['num.60', 'join.and', 'num.11', 'scale.1000']);
  });
});

const EN: [number, string][] = [
  [0, 'zero'], [7, 'seven'], [13, 'thirteen'], [20, 'twenty'], [21, 'twenty-one'], [99, 'ninety-nine'], [100, 'one hundred'],
  [105, 'one hundred and five'], [120, 'one hundred and twenty'], [345, 'three hundred and forty-five'], [1000, 'one thousand'],
  [1005, 'one thousand and five'], [1100, 'one thousand one hundred'], [15000, 'fifteen thousand'],
  [123456, 'one hundred and twenty-three thousand four hundred and fifty-six'], [100000, 'one hundred thousand'],
  [1000000, 'one million'], [2500000, 'two million five hundred thousand'],
];
describe('English numbers', () => {
  it.each(EN)('%i -> %s', (n, words) => expect(sayEn(n)).toBe(words));
});
