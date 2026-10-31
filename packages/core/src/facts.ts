/** Fact extraction: code only, every fact carries a span into the original text. */
import type { Fact, Facts, IsoDate, MessageLang, Money } from './types.js';
import type { RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import {
  addDays,
  collect,
  escapeRe,
  findTerms,
  fold,
  isValidYmd,
  overlaps,
  parseIso,
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

/** A date with no year is read as its next occurrence on or after (receivedAt - grace). */
const YEAR_GRACE_DAYS = 7;
const SEP = '[ \\u00a0\\u202f.,]';
const NUM = `\\d{1,3}(?:${SEP}\\d{3})+(?:[.,]\\d{1,2})?(?!\\d)|\\d+(?:[.,]\\d{1,2})?`;

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
    /\b(?:https?:\/\/|www\.)[^\s<>"'()]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/[^\s<>"'()]*/gi;
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
  const before = alias ? new RegExp(`(?<![\\p{L}])(?:${alias})[ \\u00a0]*:?[ \\u00a0]*$`, 'u') : undefined;

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
    let s = 0;
    while (s < groups.length) {
      let matched = false;
      for (let e = groups.length - 1; e >= s; e--) {
        const digits = groups
          .slice(s, e + 1)
          .map((x) => x.d)
          .join('');
        if (digits.length < 9) break;
        const hasPlus = plus && s === 0;
        const nat = toNational(digits, hasPlus);
        const first = groups[s];
        const last = groups[e];
        if (!nat || !first || !last) continue;
        const start = hasPlus ? first.start - 1 : first.start;
        const span = { start, end: last.end };
        if (conflicts(span, blocked)) continue;
        if (!hasPlus && !digits.startsWith('00') && !digits.startsWith(cc)) {
          if (after?.test(norm.slice(span.end)) || before?.test(norm.slice(Math.max(0, start - 14), start))) continue;
        }
        out.push(mk(text, span.start, span.end, `+${cc}${nat}`));
        s = e + 1;
        matched = true;
        break;
      }
      if (!matched) s++;
    }
  }
  return out.sort((a, b) => a.span.start - b.span.start);
}

/* -------------------------------- dates -------------------------------- */

function inferYear(m: number, d: number, receivedAt: IsoDate): number | undefined {
  const r = parseIso(receivedAt);
  if (!r) return undefined;
  const floor = addDays(receivedAt, -YEAR_GRACE_DAYS);
  for (let y = r.y; y <= r.y + 8; y++) {
    if (!isValidYmd(y, m, d)) continue;
    if (toIso(y, m, d) >= floor) return y;
  }
  return undefined;
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
    if ((m[4] ?? '').length === 2) y += 2000;
    else if (y < 1900 || y > 2100) continue;
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

  // 6. relative words ("demain", "tomorrow")
  const rel = new Map<string, number>();
  L.forEach((l) => Object.entries(l.relativeDays).forEach(([w, off]) => rel.set(w, off)));
  const relHits = findTerms(norm, [...rel.keys()]).sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  for (const h of relHits) {
    const off = rel.get(h.term);
    if (off === undefined) continue;
    push(h.start, h.end, addDays(ctx.receivedAt, off));
  }

  // 7. weekday names, only after a lead word ("avant vendredi")
  const wdLead = collect(L, (l) => l.weekdayLeadWords).map((w) => termSource(w));
  const wdRe = wdLead.length ? new RegExp(`(?:${wdLead.join('|')})\\s*$`, 'u') : undefined;
  L.forEach((l) =>
    l.weekdays.forEach((names, idx) => {
      for (const h of findTerms(norm, names)) {
        if (!wdRe || !wdRe.test(norm.slice(Math.max(0, h.start - 30), h.start))) continue;
        const ahead = (idx - weekdayOf(ctx.receivedAt) + 7) % 7;
        push(h.start, h.end, addDays(ctx.receivedAt, ahead));
      }
    }),
  );

  return out.sort((a, b) => a.span.start - b.span.start);
}

/* ------------------------------- amounts ------------------------------- */

function extractAmounts(text: string, norm: string, ctx: FactsContext, blocked: Span[]): Fact<Money>[] {
  const alias = aliasSource(ctx);
  if (!alias) return [];
  const currency = ctx.region.currency.code;
  const cands: { start: number; end: number; amount: number }[] = [];
  const add = (start: number, end: number, rawNum: string) => {
    if (rawNum.replace(/\D/g, '').length > 12) return;
    const amount = parseNumber(rawNum);
    if (Number.isFinite(amount)) cands.push({ start, end, amount });
  };

  const A = new RegExp(`(?<![\\d])(?<![\\d][.,/\\-])(${NUM})[ \\u00a0\\u202f]?(?:${alias})(?![\\p{L}\\p{N}])`, 'gu');
  const B = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alias})[ \\u00a0]*:?[ \\u00a0]*(${NUM})(?![\\d])`, 'gu');
  let m: RegExpExecArray | null;
  while ((m = A.exec(norm))) {
    const n = m[1] ?? '';
    add(m.index, m.index + m[0].length, n);
  }
  while ((m = B.exec(norm))) {
    const n = m[1] ?? '';
    const prev = norm.charAt(m.index - 1);
    if (/[\d]/.test(prev)) continue;
    add(m.index, m.index + m[0].length, n);
  }

  // Labelled amount near a currency word: "Montant: 2 500 (FCFA)"
  const C = new RegExp(`^[ \\u00a0]*[:=\\-]?[ \\u00a0]*(${NUM})(?![\\d])`, 'u');
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
  const re = /^[  ]*:?[  ]*(\d{3,5})(?![\d])/;
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

/* --------------------------------- main --------------------------------- */

export function extractFacts(text: string, ctx: FactsContext): Facts {
  const norm = fold(text);
  const urls = extractUrls(text);
  const ussd = extractUssd(text);
  const b1: Span[] = [...urls, ...ussd].map((f) => f.span);
  const phones = extractPhones(text, norm, ctx, b1);
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
