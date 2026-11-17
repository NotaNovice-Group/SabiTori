import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countTerms, findTerms, fold, hasTerm, termSource } from '../src/text.js';

/**
 * Term matching skips a term whose literal text is absent (text.ts, `literal`). This must never change a result:
 * compare with plain regex matching over every lexicon list and every evaluation message.
 */
const root = resolve(__dirname, '../../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const lists: string[][] = [];
const walk = (x: unknown) => {
  if (Array.isArray(x)) {
    if (x.every((t) => typeof t === 'string')) lists.push(x as string[]);
    else x.forEach(walk);
  } else if (x && typeof x === 'object') Object.values(x).forEach(walk);
};
for (const tag of ['fr', 'en']) walk(json(`packs/${tag}/reading.json`));
const texts = ['messages.jsonl', 'unseen.jsonl'].flatMap((f) =>
  readFileSync(resolve(root, 'packages/understand/eval', f), 'utf8').split('\n').filter(Boolean).map((l) => fold(JSON.parse(l).text as string)),
);

const one = new Map<string, RegExp>();
const alt = new Map<string[], RegExp | null>();
const reference = (norm: string, terms: string[]) => {
  const live = terms.filter((t) => t.trim());
  const single = live.filter((t) => {
    if (!one.has(t)) one.set(t, new RegExp(termSource(t), 'u'));
    return one.get(t)!.test(norm);
  });
  if (!alt.has(terms)) {
    const srcs = [...new Set(live.map((t) => fold(t).trim()))].sort((a, b) => b.length - a.length).map(termSource);
    alt.set(terms, srcs.length ? new RegExp(`(?:${srcs.join('|')})`, 'gu') : null);
  }
  const hits: { term: string; start: number; end: number }[] = [];
  const re = alt.get(terms);
  if (re) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(norm))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      hits.push({ term: m[0].replace(/\s+/g, ' '), start: m.index, end: m.index + m[0].length });
      re.lastIndex = m.index + 1;
    }
  }
  return { count: single.length, has: hits.length > 0, hits };
};

describe('term prefilter', () => {
  it(`gives the same results as plain matching (${lists.length} lists x ${texts.length} messages)`, () => {
    expect(lists.length).toBeGreaterThan(40);
    expect(texts.length).toBeGreaterThan(300);
    const diffs: string[] = [];
    for (const norm of texts) {
      for (const terms of lists) {
        const ref = reference(norm, terms);
        const got = { count: countTerms(norm, terms), has: hasTerm(norm, terms), hits: findTerms(norm, terms) };
        if (JSON.stringify(got) !== JSON.stringify(ref)) diffs.push(`${terms.slice(0, 3).join('|')}... on "${norm.slice(0, 60)}"`);
      }
    }
    expect(diffs).toEqual([]);
  }, 120_000);

  it('handles placeholders, prefixes and spacing in terms', () => {
    const norm = fold('Envoyez les 6 chiffres du code au   numero. Paiement immediat.');
    expect(countTerms(norm, ['{n} chiffres', 'paie*', 'au numero', 'absent'])).toBe(3);
    expect(findTerms(norm, ['{n} chiffres']).map((h) => h.term)).toEqual(['6 chiffres']);
    expect(hasTerm(norm, ['paie*'])).toBe(true);
    expect(hasTerm(norm, ['paiements'])).toBe(false);
    expect(countTerms(norm, ['', '  '])).toBe(0);
  });
});
