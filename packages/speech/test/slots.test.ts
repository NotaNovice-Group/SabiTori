import { describe, expect, it } from 'vitest';
import { assemble, dateTokens, isoWeekday, moneyTokens, phoneTokens } from '../src/index.js';
import { enRules, frRules } from './helpers.js';

const money = (r: typeof frRules, amount: number, currency = 'XAF') => assemble(moneyTokens(r, { amount, currency }));
const date = (r: typeof frRules, d: string, anchor = '2026-10-31') => assemble(dateTokens(r, d, anchor));

describe('money', () => {
  it('fr', () => {
    expect(money(frRules, 15000)).toBe('quinze mille francs CFA');
    expect(money(frRules, 1)).toBe('un franc CFA');
    expect(money(frRules, 0)).toBe('zéro franc CFA');
    expect(money(frRules, 80)).toBe('quatre-vingts francs CFA');
    expect(money(frRules, 2000000)).toBe('deux millions de francs CFA');
    expect(money(frRules, 2000001)).toBe('deux millions un francs CFA');
  });
  it('en', () => {
    expect(money(enRules, 15000)).toBe('fifteen thousand CFA francs');
    expect(money(enRules, 1)).toBe('one CFA franc');
  });
  it('token ids', () => {
    expect(moneyTokens(frRules, { amount: 2, currency: 'XAF' }).map((t) => t.id)).toEqual(['num.2', 'currency.XAF']);
    expect(moneyTokens(frRules, { amount: 1000000, currency: 'XAF' }).map((t) => t.id)).toEqual(['num.1', 'scale.1000000', 'word.de', 'currency.XAF']);
  });
  it('unknown currency says its code', () => {
    expect(money(enRules, 5, 'ZZZ')).toBe('five ZZZ');
  });
});

describe('dates', () => {
  it('weekday', () => {
    expect(isoWeekday('2026-10-31')).toBe(6); // Saturday
    expect(isoWeekday('2026-11-02')).toBe(1);
    expect(isoWeekday('2000-01-02')).toBe(7);
  });
  it('fr: no article, current year omitted', () => {
    expect(date(frRules, '2026-11-12')).toBe('douze novembre');
    expect(date(frRules, '2027-11-12')).toBe('douze novembre deux mille vingt-sept');
    expect(date(frRules, '2026-12-01')).toBe('premier décembre');
  });
  it('fr: no relative words', () => {
    expect(date(frRules, '2026-11-01')).toBe('premier novembre');
  });
  it('en: relative words and plain dates', () => {
    expect(date(enRules, '2026-10-31')).toBe('today');
    expect(date(enRules, '2026-11-01')).toBe('tomorrow');
    expect(date(enRules, '2026-10-30')).toBe('yesterday');
    expect(date(enRules, '2026-11-12')).toBe('twelve November');
    expect(date(enRules, '2027-11-12')).toBe('twelve November twenty twenty-seven');
    expect(date(enRules, '2005-03-04', '2005-03-01')).toBe('four March');
    expect(date(enRules, '2003-03-04', '2005-03-01')).toBe('four March two thousand and three');
  });
  it('relative ids and month ids', () => {
    expect(dateTokens(enRules, '2026-11-01', '2026-10-31').map((t) => t.id)).toEqual(['rel.tomorrow']);
    expect(dateTokens(frRules, '2026-11-12', '2026-10-31').map((t) => t.id)).toEqual(['num.12', 'month.11']);
  });
  it('rejects invalid dates', () => {
    expect(() => date(frRules, '2026-02-30')).toThrow(/bad date/);
    expect(() => date(frRules, 'tomorrow')).toThrow();
  });
});

describe('phones', () => {
  it('fr reads in pairs after the first digit', () => {
    expect(assemble(phoneTokens(frRules, '+237677123456', '237'))).toBe(
      'six, soixante-dix-sept, douze, trente-quatre, cinquante-six',
    );
    expect(assemble(phoneTokens(frRules, '677123456', '237'))).toBe('six, soixante-dix-sept, douze, trente-quatre, cinquante-six');
  });
  it('fr says leading zeros', () => {
    expect(assemble(phoneTokens(frRules, '+237600500500', '237'))).toBe('six, zéro zéro, cinquante, zéro cinq, zéro zéro');
  });
  it('en phones read first digit then pairs as numbers (Cameroonian English)', () => {
    expect(assemble(phoneTokens(enRules, '+237677123456', '237'))).toBe('six, seventy-seven, twelve, thirty-four, fifty-six');
  });
  it('pause is an optional token', () => {
    const t = phoneTokens(frRules, '677123456', '237');
    expect(t.filter((x) => x.id === 'pause.short').every((x) => x.optional)).toBe(true);
  });
  it('rejects empty', () => expect(() => phoneTokens(frRules, 'abc')).toThrow());
});
