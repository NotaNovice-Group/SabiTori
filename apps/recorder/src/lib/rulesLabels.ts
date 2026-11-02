/**
 * Atom clips (num.7, month.3, currency.XAF ...) name words inside rules.json.
 * These helpers read the word a clip should say out of the rules, and write a
 * speaker's word back, so a translator never has to touch JSON.
 *
 * Clip ids (see docs/pack-rules.md):
 *   num.7  num.7.bound  num.money.7  num.money.7.bound      atoms (and their bound form / a context's own atom)
 *   scale.100  scale.100.plural  scale.money.100            scale words
 *   join.and  join.money.and                                 joiners
 *   currency.XAF  currency.XAF.plural                        money words
 *   word.of  month.3  weekday.1  day.12  rel.today
 * Editing one form never rewrites the other: the word of "num.80" leaves its bound form ("num.80.bound") alone.
 */
import type { PackRules } from '@sabitori/core';

type R = any; // rules.json is data; shape owned by @sabitori/speech

const CONTEXTS = ['money', 'day', 'year'];

interface Loc {
  get(): string | undefined;
  set(text: string): void;
}

const split = (id: string): [string, string] => {
  const i = id.indexOf('.');
  return i < 0 ? [id, ''] : [id.slice(0, i), id.slice(i + 1)];
};

/** Takes a leading context ("money.") off an id tail, when the rules really have that context. */
function withContext(r: R, rest: string, has: (ctx: string) => boolean): { ctx?: string; rest: string } {
  const i = rest.indexOf('.');
  if (i > 0 && CONTEXTS.includes(rest.slice(0, i)) && has(rest.slice(0, i))) return { ctx: rest.slice(0, i), rest: rest.slice(i + 1) };
  return { rest };
}

function locate(r: R, id: string): Loc | null {
  if (!r) return null;
  const [kind, tail] = split(id);
  const nums = r.numbers;
  const overlay = (ctx?: string) => (ctx ? nums?.contexts?.[ctx] : nums);
  switch (kind) {
    case 'num': {
      const { ctx, rest } = withContext(r, tail, (c) => !!nums?.contexts?.[c]);
      const bound = rest.endsWith('.bound');
      const key = bound ? rest.slice(0, -6) : rest;
      const atoms = overlay(ctx)?.atoms;
      if (!atoms || !(key in atoms)) return null;
      return {
        get: () => {
          const w = atoms[key];
          return typeof w === 'string' ? (bound ? undefined : w) : bound ? w?.bound : w?.text;
        },
        set: (text) => {
          const w = atoms[key];
          atoms[key] = typeof w === 'string' ? (bound ? { text: w, bound: text, boundClip: true } : text) : { ...w, [bound ? 'bound' : 'text']: text };
        },
      };
    }
    case 'scale': {
      const { ctx, rest } = withContext(r, tail, (c) => !!nums?.contexts?.[c]);
      const plural = rest.endsWith('.plural');
      const v = plural ? rest.slice(0, -7) : rest;
      const s = overlay(ctx)?.scales?.find((x: R) => String(x.value) === v);
      if (!s) return null;
      return { get: () => (plural ? s.plural : s.word), set: (t) => void (s[plural ? 'plural' : 'word'] = t) };
    }
    case 'join': {
      const { ctx, rest } = withContext(r, tail, (c) => !!nums?.contexts?.[c]?.joiners && rest0(tail) in nums.contexts[c].joiners);
      const j = overlay(ctx)?.joiners?.[rest];
      return j ? { get: () => j.text, set: (t) => void (j.text = t) } : null;
    }
    case 'word':
      return r.words && tail in r.words ? { get: () => r.words[tail], set: (t) => void (r.words[tail] = t) } : null;
    case 'currency': {
      const plural = tail.endsWith('.plural');
      const code = plural ? tail.slice(0, -7) : tail;
      const c = r.money?.currencies?.[code];
      return c ? { get: () => (plural ? c.plural : c.text), set: (t) => void (c[plural ? 'plural' : 'text'] = t) } : null;
    }
    case 'month': {
      const i = Number(tail) - 1;
      return r.dates?.months && i >= 0 && i < r.dates.months.length ? { get: () => r.dates.months[i], set: (t) => void (r.dates.months[i] = t) } : null;
    }
    case 'weekday': {
      const i = Number(tail) - 1;
      return r.dates?.weekdays && i >= 0 && i < r.dates.weekdays.length ? { get: () => r.dates.weekdays[i], set: (t) => void (r.dates.weekdays[i] = t) } : null;
    }
    case 'day':
      return r.dates?.days && tail in r.dates.days ? { get: () => r.dates.days[tail], set: (t) => void (r.dates.days[tail] = t) } : null;
    case 'rel':
      return r.dates?.relative && tail in r.dates.relative ? { get: () => r.dates.relative[tail], set: (t) => void (r.dates.relative[tail] = t) } : null;
  }
  return null;
}
// A joiner key may itself contain "."; the context prefix is the first segment only.
const rest0 = (tail: string): string => tail.slice(tail.indexOf('.') + 1);

export function labelOf(rules: PackRules | undefined, id: string): string | undefined {
  return locate(rules as R, id)?.get();
}

/** Returns new rules with the word for clip `id` replaced. Unknown ids leave the rules unchanged. */
export function withLabel(rules: PackRules, id: string, text: string): PackRules {
  const r = structuredClone(rules) as R;
  locate(r, id)?.set(text);
  return r as PackRules;
}

export function parseRules(text?: string): PackRules | undefined {
  if (!text?.trim()) return undefined;
  try {
    return JSON.parse(text) as PackRules;
  } catch {
    return undefined;
  }
}
