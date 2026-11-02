/** Language-neutral text helpers: folding, term matching, ISO date arithmetic. */
import type { ReadingLexicon } from './reading.js';

/**
 * Lower-case and strip accents WITHOUT changing the string length, so offsets
 * in the folded text are valid offsets in the original text.
 */
export function fold(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === '’' || c === '‘' || c === '`' || c === '´') {
      out += "'";
      continue;
    }
    let base = c;
    if (c.charCodeAt(0) > 127) {
      const d = c.normalize('NFD');
      if (d.length > 1 && /\p{M}/u.test(d.charAt(1))) base = d.charAt(0);
    }
    const lower = base.toLowerCase();
    out += lower.length === 1 ? lower : base;
  }
  return out;
}

export function escapeRe(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

const WORD = '\\p{L}\\p{N}';
const sourceCache = new Map<string, string>();

/** Regex source for one lexicon term (see ReadingLexicon for the syntax). */
export function termSource(term: string): string {
  const hit = sourceCache.get(term);
  if (hit !== undefined) return hit;
  let t = fold(term).trim();
  let prefix = false;
  if (t.endsWith('*')) {
    prefix = true;
    t = t.slice(0, -1);
  }
  const body = t
    .split(/\s+/)
    .map((tok) => escapeRe(tok.replace(/\{n\}/g, '\u0001')).replace(/\u0001/g, '\\d+'))
    .join('\\s+');
  const src = `(?<![${WORD}])${body}${prefix ? '' : `(?![${WORD}])`}`;
  sourceCache.set(term, src);
  return src;
}

export interface TermHit {
  /** The text that matched (folded). */
  term: string;
  start: number;
  end: number;
}

/* One alternation regex per list, compiled once and cached (by list identity, then by content). */
const byIdentity = new WeakMap<readonly string[], RegExp | null>();
const byContent = new Map<string, RegExp | null>();

function listRegex(terms: readonly string[], flags: string): RegExp | null {
  const idKey = terms;
  const cacheKey = flags + '\u0000' + terms.join('\u0000');
  const id = flags === 'u' ? byIdentity : undefined;
  if (id && id.has(idKey)) return id.get(idKey) ?? null;
  let re = byContent.get(cacheKey);
  if (re === undefined) {
    const srcs = [...new Set(terms.filter((t) => t.trim()).map((t) => fold(t).trim()))]
      .sort((x, y) => y.length - x.length)
      .map((t) => termSource(t));
    re = srcs.length ? new RegExp(`(?:${srcs.join('|')})`, flags) : null;
    byContent.set(cacheKey, re);
  }
  id?.set(idKey, re);
  return re;
}

/**
 * All occurrences of any term in already-folded text. At each start position
 * the longest term wins; hits starting inside an earlier hit are also reported.
 */
export function findTerms(norm: string, terms: readonly string[] | undefined): TermHit[] {
  const hits: TermHit[] = [];
  if (!terms) return hits;
  const base = listRegex(terms, 'gu');
  if (!base) return hits;
  const re = new RegExp(base.source, 'gu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    hits.push({ term: m[0].replace(/\s+/g, ' '), start: m.index, end: m.index + m[0].length });
    re.lastIndex = m.index + 1;
  }
  return hits;
}

export function hasTerm(norm: string, terms: readonly string[] | undefined): boolean {
  if (!terms) return false;
  const re = listRegex(terms, 'u');
  return !!re && re.test(norm);
}

const singleCache = new Map<string, RegExp>();

/** Number of distinct terms present. */
export function countTerms(norm: string, terms: readonly string[] | undefined): number {
  if (!terms) return 0;
  let n = 0;
  for (const term of terms) {
    if (!term.trim()) continue;
    let re = singleCache.get(term);
    if (!re) {
      re = new RegExp(termSource(term), 'u');
      singleCache.set(term, re);
    }
    if (re.test(norm)) n++;
  }
  return n;
}

export function collect(
  lexicons: readonly ReadingLexicon[],
  pick: (l: ReadingLexicon) => string[] | undefined,
): string[] {
  const out: string[] = [];
  for (const l of lexicons) for (const t of pick(l) ?? []) out.push(t);
  return out;
}

/** Sentence ranges, split on . ! ? and line breaks. */
export function splitSentences(norm: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  const re = /[.!?\n\r]+(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    out.push({ start, end: m.index });
    start = m.index + m[0].length;
  }
  out.push({ start, end: norm.length });
  return out.filter((s) => s.end > s.start);
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/* ---------------- ISO date arithmetic (UTC, no time zones) ---------------- */

export function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseIso(iso: string): { y: number; m: number; d: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function addDays(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIsoDate);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** 0 = Sunday. */
export function weekdayOf(iso: string): number {
  const p = parseIso(iso);
  if (!p) return 0;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}
