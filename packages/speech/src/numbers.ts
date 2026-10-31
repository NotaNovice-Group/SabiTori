import type { JoinChoice, NumberCondition, NumberOverride, NumberRules, SayItem, ScaleRule, WordForm } from '@sabitori/core';
import { SpeechRuleError } from './errors.js';
import type { Token } from './tokens.js';

interface Prepared {
  atomKeys: number[]; // ascending
  scales: ScaleRule[]; // descending
  ranges: { lo: number; hi: number; o: NumberOverride }[];
  exact: Map<number, NumberOverride>;
}
const cache = new WeakMap<NumberRules, Prepared>();

function prepare(r: NumberRules): Prepared {
  let p = cache.get(r);
  if (p) return p;
  const exact = new Map<number, NumberOverride>();
  const ranges: Prepared['ranges'] = [];
  for (const [k, o] of Object.entries(r.overrides ?? {})) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(k);
    if (!m) throw new SpeechRuleError(`bad override key "${k}"`);
    if (m[2] === undefined) exact.set(Number(m[1]), o);
    else ranges.push({ lo: Number(m[1]), hi: Number(m[2]), o });
  }
  p = {
    atomKeys: Object.keys(r.atoms).map(Number).sort((a, b) => a - b),
    scales: [...(r.scales ?? [])].sort((a, b) => b.value - a.value),
    ranges,
    exact,
  };
  cache.set(r, p);
  return p;
}

/** Largest number the rules can compose; beyond it numbers are read digit by digit. */
export function maxNumber(r: NumberRules): number {
  const s = prepare(r).scales[0];
  if (!s) return (prepare(r).atomKeys.at(-1) ?? 0) * 2;
  return s.value * 1000 - 1;
}

function form(w: WordForm, final: boolean): string {
  if (typeof w === 'string') return w;
  return final || w.bound === undefined ? w.text : w.bound;
}

function holds(c: NumberCondition | undefined, rem: number): boolean {
  if (!c) return true;
  if (c.remainderEq && !c.remainderEq.includes(rem)) return false;
  if (c.remainderLt !== undefined && !(rem < c.remainderLt)) return false;
  if (c.remainderGte !== undefined && !(rem >= c.remainderGte)) return false;
  return true;
}

function joinTokens(r: NumberRules, choices: JoinChoice[] | undefined, rem: number): Token[] {
  const c = choices?.find((x) => holds(x.when, rem));
  if (!c) return [];
  const j = r.joiners?.[c.token];
  if (!j) throw new SpeechRuleError(`unknown joiner "${c.token}"`);
  return j.silent ? [{ id: null, text: j.text, glue: 'both' }] : [{ id: `join.${c.token}`, text: j.text }];
}

function atomToken(r: NumberRules, n: number, final: boolean): Token {
  const w = r.atoms[String(n)];
  if (w === undefined) throw new SpeechRuleError(`no atom for ${n}`);
  return { id: `num.${n}`, text: form(w, final) };
}

function scaleToken(s: ScaleRule, q: number, final: boolean): Token {
  const when = s.pluralWhen ?? 'never';
  const plural = s.plural !== undefined && q > 1 && (when === 'multiple' || (when === 'multiple_final' && final));
  return { id: `scale.${s.value}`, text: plural ? s.plural! : s.word };
}

function say(r: NumberRules, items: SayItem[], final: boolean): Token[] {
  const out: Token[] = [];
  items.forEach((it, i) => {
    const last = i === items.length - 1;
    if ('atom' in it) out.push(atomToken(r, it.atom, final && last));
    else if ('scale' in it) {
      const s = prepare(r).scales.find((x) => x.value === it.scale);
      if (!s) throw new SpeechRuleError(`no scale ${it.scale}`);
      out.push(scaleToken(s, 1, final && last));
    } else if ('join' in it) {
      const j = r.joiners?.[it.join];
      if (!j) throw new SpeechRuleError(`unknown joiner "${it.join}"`);
      out.push(j.silent ? { id: null, text: j.text, glue: 'both' } : { id: `join.${it.join}`, text: j.text });
    } else out.push(...render(r, it.number, final && last));
  });
  return out;
}

function render(r: NumberRules, n: number, final: boolean): Token[] {
  const p = prepare(r);
  const ov = p.exact.get(n) ?? p.ranges.find((x) => n >= x.lo && n <= x.hi)?.o;
  if (ov) {
    if (ov.say) return say(r, ov.say, final);
    if (ov.base !== undefined) {
      const rest = n - ov.base;
      if (rest <= 0) throw new SpeechRuleError(`override base ${ov.base} must be below ${n}`);
      return [
        ...render(r, ov.base, false),
        ...joinTokens(r, ov.join ?? r.join, rest),
        ...render(r, rest, final),
      ];
    }
  }
  if (r.atoms[String(n)] !== undefined) return [atomToken(r, n, final)];

  const s = p.scales.find((x) => x.value <= n);
  if (s) {
    const q = Math.floor(n / s.value);
    const rem = n % s.value;
    const scaleFinal = rem === 0 && final;
    const mult = q === 1 && s.omitOne ? [] : render(r, q, s.multiplierFinal ?? false);
    const word = scaleToken(s, q, scaleFinal);
    const head = s.order === 'scale_first' ? [word, ...mult] : [...mult, word];
    if (rem === 0) return head;
    return [...head, ...joinTokens(r, s.join, rem), ...render(r, rem, final)];
  }

  let a: number | undefined;
  for (const k of p.atomKeys) if (k <= n) a = k;
  if (a === undefined) throw new SpeechRuleError(`cannot say ${n}`);
  const rem = n - a;
  return [atomToken(r, a, false), ...joinTokens(r, r.join, rem), ...render(r, rem, final)];
}

/** Digit-by-digit reading using the atoms 0-9. Accepts any digit string. */
export function digitTokens(r: NumberRules, digits: string): Token[] {
  return [...digits].filter((d) => /\d/.test(d)).map((d) => atomToken(r, Number(d), true));
}

/** Tokens for a non-negative integer. Out-of-range values are read digit by digit. */
export function numberTokens(r: NumberRules, n: number): Token[] {
  if (!Number.isInteger(n) || n < 0) throw new SpeechRuleError(`cannot say ${n}: not a non-negative integer`);
  if (n > maxNumber(r)) return digitTokens(r, String(BigInt(Math.round(n))));
  return render(r, n, true);
}

/** Like numberTokens but the number is followed by more words (so "bound" forms apply). */
export function numberTokensNonFinal(r: NumberRules, n: number): Token[] {
  if (!Number.isInteger(n) || n < 0) throw new SpeechRuleError(`cannot say ${n}`);
  if (n > maxNumber(r)) return digitTokens(r, String(n));
  return render(r, n, false);
}
