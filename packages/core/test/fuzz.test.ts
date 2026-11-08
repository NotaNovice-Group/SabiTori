import { describe, expect, it } from 'vitest';
import { analyze, buildSpeechPlan, extractFacts } from '../src/index.js';
import type { Fact, Facts } from '../src/types.js';
import { ctx, lexicons, msg, region } from './helpers.js';

/**
 * Property tests on noisy, OCR-like and hostile input. A seeded generator keeps every run reproducible:
 * a failure prints the seed and the input. Properties:
 *   - nothing throws, and the whole pipeline finishes quickly even on long or pathological text;
 *   - every fact keeps a span that points at exactly its `raw` characters;
 *   - dates are real calendar dates, amounts positive whole numbers, phones E.164;
 *   - OCR-style noise around a known bill never turns into a wrong amount or a wrong deadline.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  'ENEO', 'MTN', 'Orange Money', 'CAMWATER', 'facture', 'montant', 'payer avant le', 'Date limite', 'FCFA', 'F CFA', 'XAF',
  'frs', 'novembre', 'nov.', 'décembre', 'demain', 'today', 'Due', 'by', 'Ref', 'N°', 'Code', '*126#', '#150*1#', '8080',
  'http://bit.ly/x', 'www.mtn.cm', '677 00 12 34', '+237 699-12-34-56', '00237677001234', '6 77 00 12 34', '18 450', '18.450',
  '18,450', '1 000 000', '250000', '0', '-5', '12/11/2026', '31/02/2026', '2026-11-12', '12 novembre 2026', '1er', '29 février',
  'PIN', 'code secret', 'gagné', 'won', 'bloqué', 'urgent', '!!', '...', '\n', '\t', '  ', '’', '«', '»', '€', '₣', '🙂', 'é', 'Ɛ',
  'ŋ', ' ', ' ', '​', '0O', 'l1', 'I1', '|', '%', '(', ')', ':', '/', '-', '.', ',', ';',
];

function noisy(r: () => number, maxPieces = 25): string {
  const n = 1 + Math.floor(r() * maxPieces);
  let out = '';
  for (let i = 0; i < n; i++) {
    const roll = r();
    if (roll < 0.7) out += PIECES[Math.floor(r() * PIECES.length)]!;
    else if (roll < 0.85) out += String(Math.floor(r() * 10 ** Math.floor(r() * 9)));
    else out += String.fromCodePoint(32 + Math.floor(r() * 0x2fff));
    if (r() < 0.6) out += ' ';
  }
  return out;
}

const realDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
};

function checkFacts(text: string, facts: Facts, where: string): void {
  const all: [string, Fact<unknown>[]][] = [
    ['dates', facts.dates], ['amounts', facts.amounts], ['phones', facts.phones],
    ['references', facts.references], ['urls', facts.urls], ['ussdCodes', facts.ussdCodes],
  ];
  for (const [k, list] of all) {
    for (const f of list) {
      const ctxMsg = `${where} ${k} ${JSON.stringify(f)} in ${JSON.stringify(text)}`;
      expect(f.span.start, ctxMsg).toBeGreaterThanOrEqual(0);
      expect(f.span.end, ctxMsg).toBeGreaterThan(f.span.start);
      expect(f.span.end, ctxMsg).toBeLessThanOrEqual(text.length);
      expect(text.slice(f.span.start, f.span.end), ctxMsg).toBe(f.raw);
    }
  }
  for (const d of facts.dates) expect(realDate(d.value), `${where} date ${d.value}`).toBe(true);
  for (const a of facts.amounts) {
    expect(Number.isInteger(a.value.amount) && a.value.amount > 0, `${where} amount ${JSON.stringify(a)}`).toBe(true);
    expect(a.value.currency).toMatch(/^[A-Z]{3}$/);
  }
  for (const p of facts.phones) expect(p.value, `${where} phone`).toMatch(/^\+\d{8,15}$/);
}

describe('fact extraction on random noisy input', () => {
  const SEEDS = 1500;
  it(`never throws and keeps exact spans (${SEEDS} seeded inputs)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const text = noisy(rng(seed));
      let facts: Facts;
      try {
        facts = extractFacts(text, ctx);
      } catch (e) {
        throw new Error(`seed ${seed} threw ${(e as Error).message} on ${JSON.stringify(text)}`);
      }
      checkFacts(text, facts, `seed ${seed}`);
    }
  });

  it('the whole pipeline (analyze + speech plan) never throws on noisy input', async () => {
    for (let seed = 5000; seed < 5300; seed++) {
      const text = noisy(rng(seed));
      const card = await analyze(msg(text), { region, lexicons });
      checkFacts(text, card.facts, `analyze seed ${seed}`);
      for (const f of [card.deadline, card.amount, card.contactPhone, card.reference]) {
        if (f) expect(text.slice(f.span.start, f.span.end)).toBe(f.raw);
      }
      expect(() => buildSpeechPlan(card, { today: '2026-10-31' })).not.toThrow();
    }
  });
});

describe('pathological input stays fast (no catastrophic backtracking)', () => {
  const cases: [string, string][] = [
    ['long digit run', '1'.repeat(20_000)],
    ['digits and spaces', '12 '.repeat(8_000)],
    ['digits and dots', '1.2.'.repeat(6_000)],
    ['dates without end', '12/'.repeat(8_000)],
    ['plus signs and digits', '+2376'.repeat(5_000)],
    ['hashes and stars', '*#1'.repeat(8_000)],
    ['money words', 'FCFA 1 '.repeat(5_000)],
    ['month words', 'le 12 novembre '.repeat(2_000)],
    ['urls', 'http://a.'.repeat(4_000)],
    ['mixed noise', noisy(rng(42), 4_000)],
  ];
  for (const [name, text] of cases) {
    it(name, async () => {
      const t0 = performance.now();
      const facts = extractFacts(text, ctx);
      checkFacts(text, facts, name);
      await analyze(msg(text), { region, lexicons });
      expect(performance.now() - t0, `${name} took too long`).toBeLessThan(3_000);
    });
  }
});

describe('OCR-style noise around a known bill never yields a wrong amount or deadline', () => {
  const variants = (r: () => number) => {
    const amount = ['18 450', '18.450', '18450', '18 450', '18 450', '18 450,00'][Math.floor(r() * 6)]!;
    const cur = ['FCFA', 'F CFA', 'FCFA.', 'XAF', 'Frs CFA'][Math.floor(r() * 5)]!;
    const date = ['12/11/2026', '12-11-2026', '12.11.2026', '12 novembre 2026', '12 nov. 2026', '12 Novembre 2026'][Math.floor(r() * 6)]!;
    const sp = () => [' ', '  ', '\n', ' \n '][Math.floor(r() * 4)]!;
    return `ENEO${sp()}Facture d'électricité${sp()}Montant à payer :${sp()}${amount} ${cur}${sp()}Date limite de paiement :${sp()}${date}${sp()}Service client : 677 00 12 34${r() < 0.5 ? sp() + noisy(r, 6) : ''}`;
  };
  it('400 variants', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const text = variants(rng(seed));
      const facts = extractFacts(text, ctx);
      checkFacts(text, facts, `variant ${seed}`);
      const fromBill = facts.amounts.filter((a) => a.span.start < text.indexOf('Date limite'));
      expect(fromBill.map((a) => a.value.amount), `variant ${seed}: ${JSON.stringify(text)}`).toContain(18450);
      expect(facts.dates.map((d) => d.value), `variant ${seed}: ${JSON.stringify(text)}`).toContain('2026-11-12');
      expect(facts.phones.map((p) => p.value)).toContain('+237677001234');
    }
  });
});
