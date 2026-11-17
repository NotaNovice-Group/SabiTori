/**
 * First pass of anonymising a real, consented message for messages.real.jsonl (README, "Adding real, consented,
 * anonymised messages"). It changes what code can find reliably and keeps what the evaluation measures:
 *
 * - phone numbers (found by the app's own extractor) become fictional ones in the dataset's ranges
 *   (mobile 677 00 xx xx / 699 00 xx xx, landline 233 00 xx xx), keeping the writing (spaces, dots, +237);
 * - reference, account, meter and ID numbers, and any other run of 5 or more digits that is not an amount, a date
 *   or a menu code, get random digits of the same shape (letters and separators kept);
 * - amounts, dates, menu codes (*126#) and links stay: they are what a card must read.
 *
 * Names cannot be found reliably by code. Words that look like names are only LISTED for the two people who must
 * check every message before it is used; this tool never decides that a message is anonymous.
 */
import { extractFacts, type FactsContext } from '@sabitori/core';

export type Rand = () => number;

interface Span {
  start: number;
  end: number;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Replace the digits of `raw` from left to right with `digits`, keeping every other character in place. */
function reshape(raw: string, digits: string): string {
  let k = 0;
  return raw.replace(/\d/g, () => digits[k++] ?? '0');
}

const randomDigits = (n: number, rand: Rand) => Array.from({ length: n }, () => String(Math.floor(rand() * 10))).join('');

/** A fictional Cameroonian number with the same national length as the original (9 digits today). */
function fictionalNational(national: string, rand: Rand): string {
  const prefix = national.startsWith('2') ? '23300' : national.startsWith('69') ? '69900' : '67700';
  return (prefix + randomDigits(Math.max(0, national.length - prefix.length), rand)).slice(0, national.length);
}

export interface Anonymised {
  text: string;
  /** What was changed, for the reviewers. */
  changed: { kind: 'phone' | 'number'; from: string; to: string }[];
  /** Words that may be names of people or places: a person must look at each one. */
  check: string[];
}

/** Date- or time-shaped tokens are kept even when the extractor does not take them (a past date, an odd format). */
const DATE_OR_TIME = /^(?:\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}|\d{1,2}[:h]\d{2})[.,;:]?$/;

/** Not names: units, common abbreviations and the dataset's organisation names. */
export const COMMON_WORDS = ['FCFA', 'XAF', 'CFA', 'RDV', 'SMS', 'PIN', 'OTP', 'TTC', 'HT', 'N°', 'ENEO', 'CAMWATER', 'MTN', 'MOMO', 'ORANGE', 'CNPS', 'DGI', 'DGSN', 'APEE', 'PTA', 'USSD', 'URGENT', 'ATTENTION', 'INFO'];

const NAME_LIKE = /(?<![\p{L}\p{N}])\p{Lu}[\p{Ll}'’-]+(?:[  ]+\p{Lu}[\p{Ll}'’-]+)+(?![\p{L}\p{N}])/gu;
const MID_CAP = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}{2,}(?![\p{L}\p{N}])/gu;
const CAPS_WORD = /(?<![\p{L}\p{N}])\p{Lu}{3,}(?![\p{L}\p{N}])/gu;

export function anonymise(text: string, ctx: FactsContext, rand: Rand, keepWords: readonly string[] = COMMON_WORDS): Anonymised {
  const facts = extractFacts(text, ctx);
  const keep: Span[] = [...facts.amounts, ...facts.dates, ...facts.ussdCodes, ...facts.urls].map((f) => f.span);
  const inside = (s: Span) => keep.some((k) => s.start >= k.start && s.end <= k.end);
  const edits: { span: Span; to: string; kind: 'phone' | 'number' }[] = [];
  const overlaps = (s: Span) => edits.some((e) => s.start < e.span.end && e.span.start < s.end);

  for (const p of facts.phones) {
    const raw = text.slice(p.span.start, p.span.end);
    const all = digitsOf(raw);
    const cc = all.startsWith('237') && all.length > 9 ? '237' : '';
    const national = all.slice(cc.length);
    edits.push({ span: p.span, to: reshape(raw, cc + fictionalNational(national, rand)), kind: 'phone' });
  }
  for (const m of text.matchAll(/[A-Za-z0-9][A-Za-z0-9\-/.]*\d[A-Za-z0-9\-/.]*/g)) {
    const span = { start: m.index!, end: m.index! + m[0].length };
    if (digitsOf(m[0]).length < 5 || inside(span) || overlaps(span) || DATE_OR_TIME.test(m[0])) continue;
    edits.push({ span, to: reshape(m[0], randomDigits(digitsOf(m[0]).length, rand)), kind: 'number' });
  }

  edits.sort((a, b) => b.span.start - a.span.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.span.start) + e.to + out.slice(e.span.end);

  const known = new Set([...keepWords, ...(ctx.region.officialSenders ?? []).flatMap((s) => [s.displayName, ...(s.aliases ?? [])])].filter((w): w is string => typeof w === "string").map((w) => w.toLowerCase()));
  const check = new Set<string>();
  for (const re of [NAME_LIKE, CAPS_WORD]) for (const m of out.matchAll(re)) if (!known.has(m[0].toLowerCase())) check.add(m[0]);
  // A capitalised word in the middle of a sentence (not after . ! ? : or at the start) is often a name.
  for (const m of out.matchAll(MID_CAP)) {
    const before = out.slice(0, m.index).trimEnd();
    if (before && !/[.!?:\n]$/.test(before) && !known.has(m[0].toLowerCase()) && ![...check].some((c) => c.includes(m[0]))) check.add(m[0]);
  }
  return {
    text: out,
    changed: edits.reverse().map((e) => ({ kind: e.kind, from: text.slice(e.span.start, e.span.end), to: e.to })),
    check: [...check],
  };
}
