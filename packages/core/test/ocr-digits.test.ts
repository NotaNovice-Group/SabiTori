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
