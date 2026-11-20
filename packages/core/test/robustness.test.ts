import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

// A pasted or photographed message can be anything: empty, emoji, a whole page, OCR junk, thousands of numbers.
// The card builder must never throw and never hang on it (a phone is much slower than this machine: generous bound).
const CASES: [string, string][] = [
  ['empty', ''],
  ['only spaces', '    \n\n\t  '],
  ['only emoji', '😀🙏🏾💸🔥'.repeat(50)],
  ['a long bill', 'Votre facture de 18 450 FCFA est à payer avant le 30/11/2026. '.repeat(90)],
  ['5,000 digits', '1'.repeat(5000)],
  ['OCR junk', Array.from({ length: 3000 }, (_, i) => String.fromCharCode((i * 7919) % 0xffff)).join('')],
  ['punctuation', '...,,,;;;:::!!!???'.repeat(200)],
  ['800 amounts', Array.from({ length: 800 }, (_, i) => `${i} 000 FCFA`).join(' ')],
  ['400 dates', Array.from({ length: 400 }, (_, i) => `${(i % 28) + 1}/11/2026`).join(' ')],
  ['400 phone numbers', Array.from({ length: 400 }, () => '677 12 34 56').join(' ')],
];

describe('any input gives a card, quickly', () => {
  it.each(CASES)('%s', async (_name, text) => {
    const t0 = performance.now();
    const card = await analyze(msg(text), { region, lexicons });
    expect(card).toBeTruthy();
    expect(['likely_scam', 'caution', 'no_signs']).toContain(card.scam.level);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
