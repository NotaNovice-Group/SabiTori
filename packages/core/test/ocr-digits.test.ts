import { describe, expect, it } from 'vitest';
import { extractFacts, fixOcrDigits } from '../src/facts.js';
import { ctx } from './helpers.js';

describe('OCR letters inside numbers', () => {
  it('reads O, l, I and | as digits only where the number is not in doubt', () => {
    expect(fixOcrDigits('avant le 22/lO/2026')).toBe('avant le 22/10/2026');
    expect(fixOcrDigits('November 2O26')).toBe('November 2026');
    expect(fixOcrDigits('taxe de 59 O00 FCFA')).toBe('taxe de 59 000 FCFA');
    expect(fixOcrDigits('découvert de 1l0,OO0 francs')).toBe('découvert de 110,000 francs');
    expect(fixOcrDigits('overdrawn by 500O0 F')).toBe('overdrawn by 50000 F');
  });

  it('leaves words and doubtful starts alone', () => {
    for (const t of ['lol', 'Ilona Olivier', 'IO', 'l5 000 FCFA', 'l3/11/2026', '2Go de data', '10 Mo', 'pena1ty', 'O. Ngono'])
      expect(fixOcrDigits(t)).toBe(t);
    for (const t of ['Bonjour', 'You have received 70000 XAF', 'Hello. Reminder about your pending file.']) expect(fixOcrDigits(t)).toBe(t);
  });

  it('keeps every offset: facts point at the original characters', () => {
    const t = 'COMMUNE DE BERTOUA: la taxe communale de 59 O00 FCFA devait être réglée avant le 22/lO/2026.';
    const f = extractFacts(t, ctx);
    expect(f.amounts.map((a) => a.value.amount)).toEqual([59000]);
    expect(f.amounts[0]!.raw).toBe('59 O00 FCFA');
    expect(t.slice(f.amounts[0]!.span.start, f.amounts[0]!.span.end)).toBe(f.amounts[0]!.raw);
    expect(f.dates.map((d) => d.value)).toEqual(['2026-10-22']);
    expect(f.dates[0]!.raw).toBe('22/lO/2026');
  });
});

describe('OCR-garbled month names', () => {
  const dates = (t: string) => extractFacts(t, ctx).dates.map((d) => d.value);
  it('reads a month one or two letters off, between a day and a year (photo benchmark page 16)', () => {
    expect(dates('2ème tranche le 27 noveribwe 2026 40 000 FCFA')).toEqual(['2026-11-27']);
    expect(dates('Rendez-vous le 5 decembr 2026')).toEqual(['2026-12-05']);
    expect(dates('due on 18 Decernber 2026')).toEqual(['2026-12-18']);
    expect(dates('avant le 3 fevrler 2027')).toEqual(['2027-02-03']);
  });
  it('keeps the original text in the fact', () => {
    expect(extractFacts('le 27 noveribwe 2026', ctx).dates[0]?.raw).toBe('27 noveribwe 2026');
  });
  it('needs a day and a 4-digit year, and one clearly closest month', () => {
    expect(dates('le 27 noveribwe')).toEqual([]); // no year: too weak
    expect(dates('salle 12 portes 2026')).toEqual([]); // not close to a month
    expect(dates('le 27 xxxxbre 2026')).toEqual([]); // septembre, octobre, novembre, décembre: ambiguous
    expect(dates('le 12 mais 2026')).toEqual([]); // short names must be exact
    expect(dates('lot 14 marche 2026')).toEqual([]);
  });
});
