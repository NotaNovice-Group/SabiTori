import type { JoinChoice, NumberCondition, NumberOverride, NumberRules, SayItem } from '@sabitori/core';
import { SpeechRuleError } from './errors.js';
import { asX, NUMBER_CONTEXTS, type NumberContext, type NumberRulesX, type ScaleRuleX, type WordFormX } from './rules-ext.js';
import type { Token } from './tokens.js';

export type { NumberContext } from './rules-ext.js';

/** The number system as seen in one context: the base rules with the context's own entries on top. */
interface Prepared {
  rules: NumberRulesX;
  /** The context, only when the rules really have an overlay for it (else the base ids are used). */
  ctx: NumberContext | null;
  /** Entries that come from the overlay: their clip ids carry the context ("num.money.7"). */
  own: { atoms: Set<string>; scales: Set<number>; joiners: Set<string> };
  atomKeys: number[]; // ascending
  scales: ScaleRuleX[]; // descending
  ranges: { lo: number; hi: number; o: NumberOverride }[];
  exact: Map<number, NumberOverride>;
  cap: number;
}
const cache = new WeakMap<NumberRules, Map<string, Prepared>>();
const NONE = { atoms: new Set<string>(), scales: new Set<number>(), joiners: new Set<string>() };

function overlayOf(r: NumberRulesX, ctx: NumberContext | undefined): NonNullable<NumberRulesX['contexts']>[NumberContext] | undefined {
  if (!ctx) return undefined;
  const c = r.contexts;
  return c && Object.prototype.hasOwnProperty.call(c, ctx) ? c[ctx] : undefined;
}

/** The base rules with an overlay merged in. Exported for validation and clip listing. */
export function effectiveNumbers(r0: NumberRules, ctx?: NumberContext): { rules: NumberRulesX; own: Prepared['own']; ctx: NumberContext | null } {
  const r = asX(r0);
  const ov = overlayOf(r, ctx);
  if (!ov || typeof ov !== 'object') return { rules: r, own: NONE, ctx: null };
  const scalesByValue = new Map<number, ScaleRuleX>();
  for (const s of r.scales ?? []) scalesByValue.set(s.value, s);
  for (const s of ov.scales ?? []) scalesByValue.set(s.value, s);
  const rules: NumberRulesX = {
    ...r,
    atoms: { ...r.atoms, ...(ov.atoms ?? {}) },
    joiners: { ...(r.joiners ?? {}), ...(ov.joiners ?? {}) },
    join: ov.join ?? r.join,
    scales: [...scalesByValue.values()],
    overrides: { ...(r.overrides ?? {}), ...(ov.overrides ?? {}) },
  };
  return {
    rules,
    ctx: ctx ?? null,
    own: { atoms: new Set(Object.keys(ov.atoms ?? {})), scales: new Set((ov.scales ?? []).map((s) => s.value)), joiners: new Set(Object.keys(ov.joiners ?? {})) },
  };
}

const MAX = Number.MAX_SAFE_INTEGER;

/**
 * Largest number the rules compose without a hole, derived from the scales (no "x 1000" assumption).
 * Below the smallest scale every number up to that scale composes additively, so with scales s1 < s2 < ...
 * the multiplier of s_k must itself be composable and below s_k:
 *   cap_k = s_k * (min(s_k - 1, cap_(k-1)) + 1) - 1, starting at cap_0 = s_1 - 1.
 * Base 10 with 100, 1000: 999 999. A base-20 system with 20, 400, 8000: 63 999 999.
 */
function capOf(atomKeys: number[], scalesDesc: ScaleRuleX[], ovTop: number): number {
  const asc = [...scalesDesc].reverse();
  if (asc.length === 0) return Math.max(atomKeys.at(-1) ?? 0, ovTop);
  let cap = asc[0]!.value - 1;
  for (const s of asc) cap = Math.min(MAX, s.value * (Math.min(s.value - 1, cap) + 1) - 1);
  return cap;
}

function prepare(r: NumberRules, ctx?: NumberContext): Prepared {
  let byCtx = cache.get(r);
  if (!byCtx) cache.set(r, (byCtx = new Map()));
  const key = ctx ?? '';
  const hit = byCtx.get(key);
  if (hit) return hit;
  const { rules, own, ctx: used } = effectiveNumbers(r, ctx);
  const exact = new Map<number, NumberOverride>();
  const ranges: Prepared['ranges'] = [];
  let ovTop = 0;
  for (const [k, o] of Object.entries(rules.overrides ?? {})) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(k);
    if (!m) throw new SpeechRuleError(`bad override key "${k}"`);
    if (m[2] === undefined) exact.set(Number(m[1]), o);
    else ranges.push({ lo: Number(m[1]), hi: Number(m[2]), o });
    ovTop = Math.max(ovTop, Number(m[2] ?? m[1]));
  }
  const atomKeys = Object.keys(rules.atoms).map(Number).sort((a, b) => a - b);
  const scales = [...(rules.scales ?? [])].sort((a, b) => b.value - a.value);
  const p: Prepared = { rules, ctx: used, own, atomKeys, scales, ranges, exact, cap: capOf(atomKeys, scales, ovTop) };
  byCtx.set(key, p);
  return p;
}

/** Largest number the rules can compose; beyond it numbers cannot be said (money and dates fall back; phones read digits). */
export function maxNumber(r: NumberRules, ctx?: NumberContext): number {
  return prepare(r, ctx).cap;
}

const own = <T>(o: Record<string, T> | undefined, k: string): T | undefined =>
  o !== undefined && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;

/** Clip id of an entry: base ids ("num.7") or, for an entry of the context's overlay, "num.money.7". */
function idOf(p: Prepared, kind: 'num' | 'scale' | 'join', key: string): string {
  const from = kind === 'num' ? p.own.atoms.has(key) : kind === 'scale' ? p.own.scales.has(Number(key)) : p.own.joiners.has(key);
  return p.ctx && from ? `${kind}.${p.ctx}.${key}` : `${kind}.${key}`;
}

function holds(c: NumberCondition | undefined, rem: number): boolean {
  if (!c) return true;
  if (c.remainderEq && !c.remainderEq.includes(rem)) return false;
  if (c.remainderLt !== undefined && !(rem < c.remainderLt)) return false;
  if (c.remainderGte !== undefined && !(rem >= c.remainderGte)) return false;
  return true;
}

function joinTokens(p: Prepared, choices: JoinChoice[] | undefined, rem: number): Token[] {
  const c = choices?.find((x) => holds(x.when, rem));
  if (!c) return [];
  const j = own(p.rules.joiners, c.token);
  if (!j) throw new SpeechRuleError(`unknown joiner "${c.token}"`);
  return j.silent ? [{ id: null, text: j.text, glue: 'both' }] : [{ id: idOf(p, 'join', c.token), text: j.text }];
}

function atomToken(p: Prepared, n: number, final: boolean): Token {
  const w = own<WordFormX>(p.rules.atoms, String(n));
  if (w === undefined) throw new SpeechRuleError(`no atom for ${n}`);
  const id = idOf(p, 'num', String(n));
  if (typeof w === 'string') return { id, text: w };
  if (final || w.bound === undefined) return { id, text: w.text };
  return { id: w.boundClip ? `${id}.bound` : id, text: w.bound };
}

function scaleToken(p: Prepared, s: ScaleRuleX, q: number, final: boolean): Token {
  const when = s.pluralWhen ?? 'never';
  const plural = s.plural !== undefined && q > 1 && (when === 'multiple' || (when === 'multiple_final' && final));
  const id = idOf(p, 'scale', String(s.value));
  return { id: plural && s.pluralClip ? `${id}.plural` : id, text: plural ? s.plural! : s.word };
}

/** Bounds the work of one numberTokens call so a cyclic or exploding rule set cannot hang or overflow the stack. */
interface Budget {
  depth: number;
  steps: number;
}
const MAX_DEPTH = 24;
const MAX_STEPS = 2000;

function enter(b: Budget): void {
  if (++b.steps > MAX_STEPS) throw new SpeechRuleError('number rules are too deep or cyclic (step limit exceeded)');
  if (b.depth > MAX_DEPTH) throw new SpeechRuleError('number rules are too deep or cyclic (depth limit exceeded)');
}

function say(p: Prepared, items: SayItem[], final: boolean, b: Budget): Token[] {
  const out: Token[] = [];
  items.forEach((it, i) => {
    const last = i === items.length - 1;
    if ('atom' in it) out.push(atomToken(p, it.atom, final && last));
    else if ('scale' in it) {
      const s = p.scales.find((x) => x.value === it.scale);
      if (!s) throw new SpeechRuleError(`no scale ${it.scale}`);
      out.push(scaleToken(p, s, 1, final && last));
    } else if ('join' in it) {
      const j = own(p.rules.joiners, it.join);
      if (!j) throw new SpeechRuleError(`unknown joiner "${it.join}"`);
      out.push(j.silent ? { id: null, text: j.text, glue: 'both' } : { id: idOf(p, 'join', it.join), text: j.text });
    } else out.push(...render(p, it.number, final && last, b));
  });
  return out;
}

function render(p: Prepared, n: number, final: boolean, b: Budget): Token[] {
  enter(b);
  b.depth++;
  try {
    return renderInner(p, n, final, b);
  } finally {
    b.depth--;
  }
}

function renderInner(p: Prepared, n: number, final: boolean, b: Budget): Token[] {
  const r = p.rules;
  const ov = p.exact.get(n) ?? p.ranges.find((x) => n >= x.lo && n <= x.hi)?.o;
  if (ov) {
    if (ov.say) return say(p, ov.say, final, b);
    if (ov.base !== undefined) {
      const rest = n - ov.base;
      if (rest <= 0) throw new SpeechRuleError(`override base ${ov.base} must be below ${n}`);
      return [...render(p, ov.base, false, b), ...joinTokens(p, ov.join ?? r.join, rest), ...render(p, rest, final, b)];
    }
  }
  if (own(r.atoms, String(n)) !== undefined) return [atomToken(p, n, final)];

  const s = p.scales.find((x) => x.value <= n);
  if (s) {
    const q = Math.floor(n / s.value);
    const rem = n % s.value;
    const scaleFinal = rem === 0 && final;
    const mult = q === 1 && s.omitOne ? [] : render(p, q, s.multiplierFinal ?? false, b);
    const word = scaleToken(p, s, q, scaleFinal);
    const head = s.order === 'scale_first' ? [word, ...mult] : [...mult, word];
    if (rem === 0) return head;
    return [...head, ...joinTokens(p, s.join, rem), ...render(p, rem, final, b)];
  }

  let a: number | undefined;
  for (const k of p.atomKeys) if (k <= n) a = k;
  if (a === undefined) throw new SpeechRuleError(`cannot say ${n}`);
  // Additive reading ("forty" + "five") only makes sense from the tens up. Below 10 there is no atom for the
  // number and no scale to build it: composing "nine" + "three" for 12 would speak a wrong amount.
  if (a < 10 && n >= 10) throw new SpeechRuleError(`cannot say ${n}: the rules have no word or scale for it`);
  const rem = n - a;
  return [atomToken(p, a, false), ...joinTokens(p, r.join, rem), ...render(p, rem, final, b)];
}

/** Digit-by-digit reading using the atoms 0-9. Accepts any digit string. */
export function digitTokens(r: NumberRules, digits: string, ctx?: NumberContext): Token[] {
  const p = prepare(r, ctx);
  return [...digits].filter((d) => /\d/.test(d)).map((d) => atomToken(p, Number(d), true));
}

export interface NumberOptions {
  /** Where the number is said: picks the context's own words when the rules have them. */
  context?: NumberContext;
  /**
   * What to do above `maxNumber`. "digits" (default of numberTokens, right for phone groups): read digit by digit.
   * "throw": a SpeechRuleError, so the phrase falls back to a language that can say it. Amounts, dates and
   * counts use "throw": reading 1 234 567 890 francs digit by digit would be said, but not as an amount.
   */
  overflow?: 'digits' | 'throw';
  /** More number words follow, so bound forms apply. */
  final?: boolean;
}

function checked(r: NumberRules, n: unknown, o: NumberOptions): Token[] {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new SpeechRuleError(`cannot say ${String(n)}: not a non-negative integer`);
  // Beyond 2^53 the integer is no longer exact: refuse rather than speak a different amount.
  if (!Number.isSafeInteger(n)) throw new SpeechRuleError(`cannot say ${n}: too large to be exact`);
  try {
    const p = prepare(r, o.context);
    if (n > p.cap) {
      if (o.overflow === 'throw') throw new SpeechRuleError(`cannot say ${n}: the number rules compose up to ${p.cap}`);
      return digitTokens(r, String(n), o.context);
    }
    return render(p, n, o.final ?? true, { depth: 0, steps: 0 });
  } catch (e) {
    if (e instanceof SpeechRuleError) throw e;
    throw new SpeechRuleError(`number rules failed for ${n}: ${(e as Error).message}`);
  }
}

/** Tokens for a non-negative integer. Above `maxNumber` the number is read digit by digit unless `overflow: "throw"`. */
export function numberTokens(r: NumberRules, n: number, opts: NumberOptions = {}): Token[] {
  return checked(r, n, opts);
}

/** Like numberTokens but the number is followed by more words (so "bound" forms apply). */
export function numberTokensNonFinal(r: NumberRules, n: number, opts: NumberOptions = {}): Token[] {
  return checked(r, n, { ...opts, final: false });
}

/**
 * Every clip id of the number system, base and contexts: atoms, scales, joiners and the extra clips of
 * bound and plural forms that have their own recording. Used by requiredClips.
 */
export function numberClipIds(r: NumberRules): string[] {
  const out = new Set<string>();
  const add = (p: Prepared, ownOnly: boolean): void => {
    const rules = p.rules;
    for (const k of Object.keys(rules.atoms)) {
      if (ownOnly && !p.own.atoms.has(k)) continue;
      const id = idOf(p, 'num', String(Number(k)));
      out.add(id);
      const w = rules.atoms[k]!;
      if (typeof w !== 'string' && w.boundClip && w.bound !== undefined) out.add(`${id}.bound`);
    }
    for (const s of rules.scales ?? []) {
      if (ownOnly && !p.own.scales.has(s.value)) continue;
      if (s.value > p.cap) continue;
      const id = idOf(p, 'scale', String(s.value));
      out.add(id);
      if (s.pluralClip && s.plural !== undefined) out.add(`${id}.plural`);
    }
    const joins = (js?: JoinChoice[]): void => {
      for (const j of js ?? []) if (!rules.joiners?.[j.token]?.silent) out.add(idOf(p, 'join', j.token));
    };
    // Joiners that are really used: the default join, the scales' joins (of this level) and the overrides'.
    joins(rules.join);
    for (const s of rules.scales ?? []) joins(s.join);
    for (const o of Object.values(rules.overrides ?? {})) {
      joins(o.join);
      for (const it of o.say ?? []) if ('join' in it && !rules.joiners?.[it.join]?.silent) out.add(idOf(p, 'join', it.join));
    }
    if (ownOnly) for (const k of p.own.joiners) if (!rules.joiners?.[k]?.silent) out.add(idOf(p, 'join', k));
  };
  add(prepare(r), false);
  for (const c of NUMBER_CONTEXTS) {
    const p = prepare(r, c);
    if (p.ctx) add(p, true);
  }
  return [...out];
}
