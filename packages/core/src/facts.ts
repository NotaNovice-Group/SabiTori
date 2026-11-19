/** Fact extraction: code only, every fact carries a span into the original text. */
import type { Fact, Facts, IsoDate, MessageLang, Money } from './types.js';
import type { RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import {
  addDays,
  collect,
  daysBetween,
  escapeRe,
  findTerms,
  fold,
  isIsoDate,
  isValidYmd,
  overlaps,
  parseIso,
  splitSentences,
  termSource,
  toIso,
  weekdayOf,
} from './text.js';

export interface FactsContext {
  region: RegionConfig;
  lexicons: ReadingLexicon[];
  receivedAt: IsoDate;
}

type Span = { start: number; end: number };

/** A year-less date is the occurrence nearest to receivedAt: past if within PAST_DAYS before, else the next one. */
const PAST_DAYS = 180;
const SEP = '[ \\u00a0\\u202f.,]';
/** Longest phone written as digits: 00 + country code (up to 3) + 9. */
const MAX_PHONE_DIGITS = 15;
/** Stands for an OCR line break removed from inside a digit group (amounts only). */
const JOIN = '\u0001';
const D3 = `\\d${JOIN}?\\d${JOIN}?\\d`;
const NUM = `\\d{1,3}(?:${SEP}${D3})+(?:[.,]\\d{1,2})?(?!\\d)|\\d+(?:[.,]\\d{1,2})?`;

function conflicts(span: Span, blocked: Span[]): boolean {
  return blocked.some((b) => overlaps(span, b));
}

function mk<T>(text: string, start: number, end: number, value: T): Fact<T> {
  return { value, span: { start, end }, raw: text.slice(start, end) };
}

/* ------------------------------ language ------------------------------ */

function detectLang(norm: string, lexicons: ReadingLexicon[]): MessageLang {
  const words = norm.match(/[\p{L}']+/gu) ?? [];
  if (words.length < 3) return 'unknown';
  let best: { tag: string; score: number } | undefined;
  let second = 0;
  for (const l of lexicons) {
    const stop = new Set(l.stopwords.map(fold));
    let hits = 0;
    for (const w of words) if (stop.has(w)) hits++;
    if (!best || hits > best.score) {
      if (best) second = Math.max(second, best.score);
      best = { tag: l.tag, score: hits };
    } else second = Math.max(second, hits);
  }
  if (!best || best.score < 2 || best.score <= second) return 'unknown';
  if (best.score / words.length < 0.08) return 'unknown';
  return best.tag === 'fr' || best.tag === 'en' ? best.tag : 'unknown';
}

/* ------------------------------- urls/ussd ------------------------------- */

function extractUrls(text: string): Fact<string>[] {
  const out: Fact<string>[] = [];
  const re =
    /\b(?:https?:\/\/|www\.)[^\s<>"'()]+|\b[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24}\/[^\s<>"'()]*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0].replace(/[.,;:!?]+$/, '');
    if (raw.length < 4) continue;
    out.push(mk(text, m.index, m.index + raw.length, raw));
  }
  return out;
}

function extractUssd(text: string): Fact<string>[] {
  const out: Fact<string>[] = [];
  const re = /(?<![\w])[*#]\d[\d*#]*#/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(mk(text, m.index, m.index + m[0].length, m[0]));
  return out;
}

/* ------------------------------- currency ------------------------------- */

function aliasSource(ctx: FactsContext): string {
  const set = new Set<string>();
  for (const a of ctx.region.currency.aliases) set.add(fold(a));
  for (const a of collect(ctx.lexicons, (l) => l.currencyWords)) set.add(fold(a));
  return [...set]
    .filter((a) => a.trim())
    .sort((a, b) => b.length - a.length)
    .map((a) => escapeRe(a.trim()).replace(/\s+/g, '[ \\u00a0]*'))
    .join('|');
}

function parseNumber(raw: string): number {
  const dec = /^(.*\d)[.,](\d{1,2})$/.exec(raw);
  // "15.000" is thousands (3 digits); "15,50" is decimals (1-2 digits).
  if (dec && dec[1] !== undefined && dec[2] !== undefined) {
    const intPart = dec[1].replace(/[^\d]/g, '');
    return Math.round(Number(`${intPart}.${dec[2]}`));
  }
  return Number(raw.replace(/[^\d]/g, ''));
}

/* -------------------------------- phones -------------------------------- */

function extractPhones(text: string, norm: string, ctx: FactsContext, blocked: Span[]): Fact<string>[] {
  const out: Fact<string>[] = [];
  const cc = ctx.region.phone.countryCode;
  const national = new RegExp(`^(?:${ctx.region.phone.nationalPattern})$`);
  const alias = aliasSource(ctx);
  const after = alias ? new RegExp(`^[ \\u00a0]?(?:${alias})(?![\\p{L}\\p{N}])`, 'u') : undefined;
  const before = alias ? new RegExp(`(?<![\\p{L}])(?<!\\d[ \\u00a0\\u202f]?)(?:${alias})[ \\u00a0]*:?[ \\u00a0]*$`, 'u') : undefined;

  const toNational = (digits: string, plus: boolean): string | undefined => {
    let rest = digits;
    if (digits.length === 9) rest = digits;
    else if (digits.startsWith('00' + cc)) rest = digits.slice(2 + cc.length);
    else if (digits.startsWith(cc) && (plus || digits.length === cc.length + 9)) rest = digits.slice(cc.length);
    else return undefined;
    return national.test(rest) ? rest : undefined;
  };

  const re = /(?<![\p{N}])(\+?)(\d+(?:[ .\-  ]\d+)*)(?![\p{N}])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const plus = m[1] === '+';
    const body = m[2] ?? '';
    const bodyStart = m.index + (plus ? 1 : 0);
    const groups: { d: string; start: number; end: number }[] = [];
    const gre = /\d+/g;
    let g: RegExpExecArray | null;
    while ((g = gre.exec(body))) groups.push({ d: g[0], start: bodyStart + g.index, end: bodyStart + g.index + g[0].length });
    // Take phones from the END of the run backwards: a phone is the longest valid window that ends
    // at the end of the remaining groups (suffix-aligned). If none, drop the last group and retry.
    // A window whose first group looks like a year (2026 677 12 34 56) is never a phone.
    const yearLike = (d: string) => /^(19|20)\d\d$/.test(d);
    let hi = groups.length - 1;
    while (hi >= 0) {
      const last = groups[hi];
      let chosen: { s: number; nat: string; span: Span } | undefined;
      // Walk the window start DOWN from hi and stop once the joined digits exceed the longest possible
      // phone (00 + country code + 9 digits): linear in the run, never cubic.
      let len = 0;
      for (let s = hi; s >= 0; s--) {
        const first = groups[s];
        if (!first || !last) break;
        len += first.d.length;
        if (len > MAX_PHONE_DIGITS) break;
        if (len < 9) continue;
        if (yearLike(first.d) && s < hi) continue;
        const digits = groups
          .slice(s, hi + 1)
          .map((x) => x.d)
          .join('');
        const hasPlus = plus && s === 0;
        const nat = toNational(digits, hasPlus);
        if (!nat) continue;
        const start = hasPlus ? first.start - 1 : first.start;
        const span = { start, end: last.end };
        if (conflicts(span, blocked)) continue;
        if (!hasPlus && !digits.startsWith('00') && !digits.startsWith(cc)) {
          if (after?.test(norm.slice(span.end, span.end + 40)) || before?.test(norm.slice(Math.max(0, start - 14), start))) continue;
        }
        chosen = { s, nat, span }; // keep going: the longest valid window (smallest s) wins
      }
      if (chosen) {
        out.push(mk(text, chosen.span.start, chosen.span.end, `+${cc}${chosen.nat}`));
        hi = chosen.s - 1;
      } else hi--;
    }
  }
  return out.sort((a, b) => a.span.start - b.span.start);
}

/* -------------------------------- dates -------------------------------- */

function inferYear(m: number, d: number, receivedAt: IsoDate): number | undefined {
  const r = receivedAt ? parseIso(receivedAt) : undefined;
  if (!r) return undefined;
  let past: { y: number; delta: number } | undefined;
  let next: { y: number; delta: number } | undefined;
  for (let y = r.y - 1; y <= r.y + 1; y++) {
    if (!isValidYmd(y, m, d)) continue;
    const delta = daysBetween(receivedAt, toIso(y, m, d));
    if (delta < 0) {
      if (delta >= -PAST_DAYS && (!past || delta > past.delta)) past = { y, delta };
    } else if (!next || delta < next.delta) next = { y, delta };
  }
  return (past ?? next)?.y;
}

function extractDates(text: string, norm: string, ctx: FactsContext, blocked: Span[]): Fact<IsoDate>[] {
  const out: Fact<IsoDate>[] = [];
  const taken: Span[] = [...blocked];
  const push = (start: number, end: number, value: string) => {
    const span = { start, end };
    if (conflicts(span, taken)) return false;
    taken.push(span);
    out.push(mk(text, start, end, value));
    return true;
  };
  const L = ctx.lexicons;

  const monthMap = new Map<string, number>();
  L.forEach((l) =>
    l.months.forEach((names, i) => names.forEach((n) => monthMap.set(fold(n).replace(/\.$/, ''), i + 1))),
  );
  const monthAlt = [...monthMap.keys()]
    .sort((a, b) => b.length - a.length)
    .map((n) => escapeRe(n))
    .join('|');
  const sufAlt = collect(L, (l) => l.ordinalSuffixes)
    .map((s) => escapeRe(fold(s)))
    .sort((a, b) => b.length - a.length)
    .join('|');
  const fillAlt = collect(L, (l) => l.dateFillers)
    .map((s) => escapeRe(fold(s)))
    .join('|');
  const suf = sufAlt ? `(?:${sufAlt})?` : '';
  const fill = fillAlt ? `(?:(?:${fillAlt})\\s+)?` : '';
  const leadAlt = collect(L, (l) => l.dateLeadWords).map((w) => termSource(w));
  const leadRe = leadAlt.length ? new RegExp(`(?:${leadAlt.join('|')})\\s*$`, 'u') : undefined;
  const hasLead = (start: number) => !!leadRe && leadRe.test(norm.slice(Math.max(0, start - 30), start));

  const finish = (start: number, end: number, y: number | undefined, m: number, d: number) => {
    if (y === undefined || !isValidYmd(y, m, d)) return;
    push(start, end, toIso(y, m, d));
  };

  // 1. ISO yyyy-mm-dd
  let re = /(?<![\d/.\-])(20\d\d)([/.\-])(\d{2})\2(\d{2})(?![\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) finish(m.index, m.index + m[0].length, Number(m[1]), Number(m[3]), Number(m[4]));

  // 2. dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy
  re = /(?<![\d/.\-])(\d{1,2})([/.\-])(\d{1,2})\2(\d{4}|\d{2})(?![\d])(?![/.\-]\d)/g;
  while ((m = re.exec(norm))) {
    let y = Number(m[4]);
    if ((m[4] ?? '').length === 2) {
      // "15/11/99" is 20YY only within 5 years of the day the message arrived; otherwise it is not read.
      const ry = ctx.receivedAt ? parseIso(ctx.receivedAt)?.y : undefined;
      y += 2000;
      if (ry === undefined || Math.abs(y - ry) > 5) continue;
    } else if (y < 1900 || y > 2100) continue;
    finish(m.index, m.index + m[0].length, y, Number(m[3]), Number(m[1]));
  }

  // 3. day + month name (+ year)
  if (monthAlt) {
    re = new RegExp(
      `(?<![\\p{L}\\p{N}/.\\-])(\\d{1,2})${suf}\\s*${fill}(${monthAlt})(?![\\p{L}\\p{N}])(\\.?\\s*,?\\s*(20\\d\\d)(?!\\d))?`,
      'gu',
    );
    while ((m = re.exec(norm))) {
      const mon = monthMap.get(m[2] ?? '');
      if (!mon) continue;
      const d = Number(m[1]);
      let end = m.index + m[0].length;
      let y = m[4] ? Number(m[4]) : undefined;
      if (y === undefined) {
        end = m.index + m[0].length;
        y = inferYear(mon, d, ctx.receivedAt);
      }
      finish(m.index, end, y, mon, d);
    }

    // 3b. OCR-garbled month name ("27 noveribwe 2026"): only between a day and a 4-digit year, and only when one month
    //     is clearly closest (up to 2 letter changes for names of 7+ letters, 1 for 6, none below).
    re = /(?<![\p{L}\p{N}/.\-])(\d{1,2})\s+(\p{L}{5,13})\.?\s*,?\s*(20\d\d)(?!\d)/gu;
    while ((m = re.exec(norm))) {
      const mon = nearMonth(m[2] ?? '', monthMap);
      if (mon) finish(m.index, m.index + m[0].length, Number(m[3]), mon, Number(m[1]));
    }
  }

  // 4. dd/mm without a year, only after a lead word ("avant le 15/11")
  re = /(?<![\d/.\-])(\d{1,2})\/(\d{1,2})(?![\d/])/g;
  while ((m = re.exec(norm))) {
    if (!hasLead(m.index)) continue;
    const d = Number(m[1]);
    const mo = Number(m[2]);
    finish(m.index, m.index + m[0].length, inferYear(mo, d, ctx.receivedAt), mo, d);
  }

  // 5. month name + day (+ year)
  if (monthAlt) {
    re = new RegExp(
      `(?<![\\p{L}\\p{N}])(${monthAlt})(?![\\p{L}\\p{N}])\\.?\\s*(\\d{1,2})${suf}(?!\\d)(?![.,]\\d{3})(?!\\s\\d{3}(?!\\d))(\\s*,?\\s*(20\\d\\d)(?!\\d))?`,
      'gu',
    );
    while ((m = re.exec(norm))) {
      const mon = monthMap.get(m[1] ?? '');
      if (!mon) continue;
      const d = Number(m[2]);
      const y = m[4] ? Number(m[4]) : inferYear(mon, d, ctx.receivedAt);
      finish(m.index, m.index + m[0].length, y, mon, d);
    }
  }

  const explicit = [...out];

  if (!ctx.receivedAt) return out.sort((a, b) => a.span.start - b.span.start);

  // 6. relative words ("demain", "tomorrow")
  const rel = new Map<string, number>();
  L.forEach((l) => Object.entries(l.relativeDays).forEach(([w, off]) => rel.set(fold(w).trim().replace(/\s+/g, ' '), off)));
  const relHits = findTerms(norm, [...rel.keys()]).sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  for (const h of relHits) {
    const off = rel.get(h.term);
    if (off === undefined) continue;
    push(h.start, h.end, addDays(ctx.receivedAt, off));
  }

  // 7. weekday names, only after a lead word ("avant vendredi"). A weekday written next to an
  //    explicit date ("lundi 9 novembre 2026") is only a label of that date, never a date of its own.
  const wdLead = collect(L, (l) => l.weekdayLeadWords).map((w) => termSource(w));
  const wdRe = wdLead.length ? new RegExp(`(?:${wdLead.join('|')})\\s*$`, 'u') : undefined;
  const sentences = splitSentences(norm);
  L.forEach((l) =>
    l.weekdays.forEach((names, idx) => {
      for (const h of findTerms(norm, names)) {
        if (!wdRe || !wdRe.test(norm.slice(Math.max(0, h.start - 30), h.start))) continue;
        if (explicit.some((e) => e.span.start >= h.end && e.span.start - h.end <= 3)) continue;
        const sen = sentences.find((x) => h.start >= x.start && h.start < x.end);
        if (
          sen &&
          explicit.some((e) => e.span.start >= sen.start && e.span.end <= sen.end && weekdayOf(e.value) === idx)
        )
          continue;
        const ahead = (idx - weekdayOf(ctx.receivedAt) + 7) % 7;
        push(h.start, h.end, addDays(ctx.receivedAt, ahead));
      }
    }),
  );

  return out.sort((a, b) => a.span.start - b.span.start);
}

/* ------------------------------- amounts ------------------------------- */

function extractAmounts(text: string, norm0: string, ctx: FactsContext, blocked: Span[]): Fact<Money>[] {
  const alias = aliasSource(ctx);
  if (!alias) return [];
  const currency = ctx.region.currency.code;
  // OCR line breaks inside a number (same length, so spans stay valid):
  //   "15\n000" -> group break; "15 0\n00" -> the break sits inside the group, removed (JOIN).
  const norm = norm0
    .replace(/(?<![\d])(\d{1,3})\n(\d{3})(?!\d)/g, '$1 $2')
    .replace(/(?<=\d[   .,])(\d{1,2})\n(\d{1,2})(?!\d)/g, (all, l: string, r: string) =>
      l.length + r.length === 3 ? `${l}${JOIN}${r}` : all,
    );
  const cands: { start: number; end: number; amount: number }[] = [];
  const add = (start: number, end: number, rawNum0: string, aliasText = '') => {
    // An all-zero minor unit is exact ("18 450,00 FCFA" on an invoice is 18 450); drop it before the checks.
    // Real decimals ("15,50") are still refused below: FCFA has no minor unit and an amount is never rounded.
    const rawNum = rawNum0.replace(new RegExp(`(?<=\\d)[.,]0{1,2}$`), '');
    const digits = rawNum.replace(/\D/g, '');
    // The one-letter alias ("F") needs real money digits: 3+ digits, not a bare year ("2026 F"), or a thousands group.
    if (/^\p{L}$/u.test(aliasText.replace(/[\s:]+/g, ''))) {
      const grouped = /\d[ \u00a0\u202f.,]\d{3}(?!\d)/.test(rawNum);
      if (!grouped && (digits.length < 3 || /^(19|20)\d\d$/.test(digits))) return;
    }
    if (digits.length > 12) return;
    // No leading zero ("00 FCFA", "05000"), no zero, no minor unit ("15,50": never rounded to 16).
    if (digits.startsWith('0')) return;
    if (/^(.*\d)[.,]\d{1,2}$/.test(rawNum.replace(new RegExp(JOIN, 'g'), ''))) return;
    const amount = parseNumber(rawNum.replace(new RegExp(JOIN, 'g'), ''));
    if (Number.isFinite(amount) && amount > 0) cands.push({ start, end, amount });
  };

  // Not glued to a letter or digit before it, and not the tail of "1 5 000" (a lone 1-3 digit group + space).
  const lead = `(?<![\\p{L}\\d${JOIN}])(?<!(?<![\\d.,])\\d{1,3}[ \\u00a0\\u202f])(?<![\\d][.,/\\-])`;
  const A = new RegExp(`${lead}(${NUM})[ \\u00a0\\u202f]?(?:${alias})(?![\\p{L}\\p{N}])`, 'gu');
  const B = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alias})[ \\u00a0]*:?[ \\u00a0]*(${NUM})(?![\\d])(?![ \\u00a0\\u202f]\\d)`, 'gu');
  let m: RegExpExecArray | null;
  while ((m = A.exec(norm))) {
    const n = m[1] ?? '';
    add(m.index, m.index + m[0].length, n, m[0].slice(n.length));
  }
  while ((m = B.exec(norm))) {
    const n = m[1] ?? '';
    const prev = norm.charAt(m.index - 1);
    if (/[\d]/.test(prev)) continue;
    add(m.index, m.index + m[0].length, n, m[0].slice(0, m[0].length - n.length));
  }

  // Labelled amount near a currency word: "Montant: 2 500 (FCFA)"
  // The number must end there: "Frais de scolarité: 1ère tranche" is an ordinal, not an amount of 1.
  const C = new RegExp(`^[ \\u00a0]*[:=\\-]?[ \\u00a0]*(${NUM})(?![\\d\\p{L}])(?![ \\u00a0\\u202f]\\d)`, 'u');
  const near = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alias})(?![\\p{L}\\p{N}])`, 'u');
  for (const h of findTerms(norm, collect(ctx.lexicons, (l) => l.amountWords))) {
    const c = C.exec(norm.slice(h.end));
    if (!c || !c[1]) continue;
    const start = h.end + c[0].length - c[1].length;
    const end = h.end + c[0].length;
    const win = norm.slice(Math.max(0, h.start - 30), end + 30);
    if (!near.test(win)) continue;
    add(start, end, c[1]);
  }

  cands.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Fact<Money>[] = [];
  const taken: Span[] = [...blocked];
  for (const c of cands) {
    const span = { start: c.start, end: c.end };
    if (conflicts(span, taken)) continue;
    taken.push(span);
    out.push(mk(text, c.start, c.end, { amount: c.amount, currency }));
  }
  return out;
}

/* ------------------------------- references ------------------------------- */

function extractReferences(text: string, norm: string, ctx: FactsContext, blocked: Span[]): Fact<string>[] {
  const out: Fact<string>[] = [];
  const hits = findTerms(norm, collect(ctx.lexicons, (l) => l.referenceLabels));
  const seen = new Set<number>();
  for (const h of hits) {
    const re = /[\s:.#°=]*([a-z0-9][a-z0-9\-/_]{2,}[a-z0-9])(?![a-z0-9])/y;
    re.lastIndex = 0;
    const slice = norm.slice(h.end, h.end + 60);
    const m = re.exec(slice);
    if (!m || !m[1]) continue;
    const tok = m[1];
    if (!/\d/.test(tok)) continue;
    if (/^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/.test(tok)) continue;
    const start = h.end + m[0].length - tok.length;
    const end = start + tok.length;
    if (seen.has(start) || conflicts({ start, end }, blocked)) continue;
    seen.add(start);
    out.push(mk(text, start, end, text.slice(start, end)));
  }
  return out.sort((a, b) => a.span.start - b.span.start);
}

function extractShortCodes(text: string, norm: string, ctx: FactsContext, blocked: Span[]): Fact<string>[] {
  const out: Fact<string>[] = [];
  const re = /^[  ]*:?[  ]*(\d{4,5})(?![\d])/;
  for (const h of findTerms(norm, collect(ctx.lexicons, (l) => l.shortCodeLabels))) {
    const m = re.exec(norm.slice(h.end));
    if (!m || !m[1]) continue;
    const start = h.end + m[0].length - m[1].length;
    const end = start + m[1].length;
    if (/^(19|20)\d\d$/.test(m[1]) || conflicts({ start, end }, blocked)) continue;
    if (out.some((o) => o.span.start === start)) continue;
    out.push(mk(text, start, end, m[1]));
  }
  return out;
}

/** Letter edits (insert, delete, change) from a to b, or max + 1 once it is clearly larger. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * The month a garbled word most likely is, or undefined if it is not close to one, or as close to two months.
 * OCR often reads "m" as "rn" or "ri" ("Decernber", "noveribre"), so that reading is tried too.
 */
export function nearMonth(word: string, monthMap: Map<string, number>): number | undefined {
  if (monthMap.has(word)) return undefined; // an exact name is read by the strict rule
  const forms = [word, word.replace(/r[ni]/g, 'm')];
  let best = 3;
  const found = new Set<number>();
  for (const [name, mon] of monthMap) {
    if (name.length < 6 || /[^\p{L}]/u.test(name)) continue;
    const allowed = name.length >= 7 ? 2 : 1;
    const d = Math.min(...forms.map((f) => editDistance(f, name, allowed)));
    if (d > allowed) continue;
    if (d < best) {
      best = d;
      found.clear();
    }
    if (d === best) found.add(mon);
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/* --------------------------------- main --------------------------------- */

const CONFUSABLE: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', '|': '1' };
const toDigits = (t: string) => t.replace(/[OoIl|]/g, (c) => CONFUSABLE[c]!);

/**
 * OCR reads 0 as O and 1 as l, I or |, inside numbers ("2O26", "59 O00 FCFA", "22/lO/2026"). Turn them back into
 * digits only where the reading is not in doubt: between two digits ("2O26", "1l0"), in a 3-character thousands
 * group right after a digit group ("59 O00"), or as a 1-2 character date part between digit groups joined by / . or -.
 * A confusable at the START of a number ("l5 000") is left alone: it may be a 1 or a stray mark, and a wrong amount
 * is worse than none. Same length, so every span and offset stays valid; words ("lol", "Ilona", "IO") are untouched.
 */
export function fixOcrDigits(text: string): string {
  let out = text;
  // between digits (repeat: "1OO0" needs two passes)
  for (let i = 0; i < 3; i++) out = out.replace(/(?<=\d)[OoIl|]+(?=\d)/g, toDigits);
  // thousands group after a digit group: "59 O00", "1 OO0", "110,OO0"
  out = out.replace(/(?<=\d[ \u00a0\u202f.,])[0-9OoIl|]{3}(?![\p{L}\p{N}])/gu, (t) => (/\d/.test(t) ? toDigits(t) : t));
  // a date part: "22/lO/2026"
  out = out.replace(/(?<=\d[/.\-])[OoIl|]{1,2}(?=[/.\-]\d)/g, toDigits);
  return out;
}

export function extractFacts(original: string, ctx0: FactsContext): Facts {
  const text = fixOcrDigits(original);
  const facts = extractFactsExact(text, ctx0);
  if (text === original) return facts;
  // The "show me where" view shows what the message really says.
  const back = <T>(f: { value: T; span: { start: number; end: number }; raw: string }) => ({ ...f, raw: original.slice(f.span.start, f.span.end) });
  return {
    ...facts,
    dates: facts.dates.map(back),
    amounts: facts.amounts.map(back),
    phones: facts.phones.map(back),
    references: facts.references.map(back),
    urls: facts.urls.map(back),
    ussdCodes: facts.ussdCodes.map(back),
  };
}

function extractFactsExact(text: string, ctx0: FactsContext): Facts {
  // An invalid receivedAt never reaches a fact: relative words, weekdays, year-less and 2-digit-year dates are skipped.
  const ctx: FactsContext = { ...ctx0, receivedAt: isIsoDate(ctx0.receivedAt) ? ctx0.receivedAt : '' };
  const norm = fold(text);
  const urls = extractUrls(text);
  const ussd = extractUssd(text);
  const b1: Span[] = [...urls, ...ussd].map((f) => f.span);
  // A 9-digit token written as a reference ("N° compteur: 677123456") is a reference, not a phone.
  const refTokens = extractReferences(text, norm, ctx, b1).map((f) => f.span);
  const phones = extractPhones(text, norm, ctx, [...b1, ...refTokens]);
  const b2 = [...b1, ...phones.map((f) => f.span)];
  const dates = extractDates(text, norm, ctx, b2);
  const b3 = [...b2, ...dates.map((f) => f.span)];
  const amounts = extractAmounts(text, norm, ctx, b3);
  const b4 = [...b3, ...amounts.map((f) => f.span)];
  const references = extractReferences(text, norm, ctx, b4);
  const shortCodes = extractShortCodes(text, norm, ctx, [...b4, ...references.map((f) => f.span)]);
  return {
    lang: detectLang(norm, ctx.lexicons),
    dates,
    amounts,
    phones,
    references,
    urls,
    ussdCodes: [...ussd, ...shortCodes].sort((a, b) => a.span.start - b.span.start),
  };
}
