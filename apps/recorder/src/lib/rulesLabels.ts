/**
 * Atom clips (num.7, month.3, currency.XAF ...) name words inside rules.json.
 * These helpers read the word a clip should say out of the rules, and write a
 * speaker's word back, so a translator never has to touch JSON.
 */
import type { PackRules } from '@sabitori/core';

type R = any; // rules.json is data; shape owned by @sabitori/speech

const split = (id: string): [string, string] => {
  const i = id.indexOf('.');
  return [id.slice(0, i), id.slice(i + 1)];
};
const form = (w: unknown): string | undefined => (typeof w === 'string' ? w : (w as { text?: string } | undefined)?.text);

export function labelOf(rules: PackRules | undefined, id: string): string | undefined {
  const r = rules as R;
  if (!r) return undefined;
  const [kind, k] = split(id);
  switch (kind) {
    case 'num': return form(r.numbers?.atoms?.[k]);
    case 'scale': return r.numbers?.scales?.find((s: R) => String(s.value) === k)?.word;
    case 'join': return r.numbers?.joiners?.[k]?.text;
    case 'word': return r.words?.[k];
    case 'currency': return r.money?.currencies?.[k]?.text;
    case 'month': return r.dates?.months?.[Number(k) - 1];
    case 'weekday': return r.dates?.weekdays?.[Number(k) - 1];
    case 'day': return r.dates?.days?.[k];
    case 'rel': return r.dates?.relative?.[k];
  }
  return undefined;
}

/** Returns new rules with the word for clip `id` replaced. Unknown ids leave the rules unchanged. */
export function withLabel(rules: PackRules, id: string, text: string): PackRules {
  const r = structuredClone(rules) as R;
  const [kind, k] = split(id);
  switch (kind) {
    case 'num': {
      const cur = r.numbers?.atoms?.[k];
      if (cur === undefined) break;
      r.numbers.atoms[k] = typeof cur === 'string' ? text : { ...cur, text, ...(cur.bound !== undefined ? { bound: text } : {}) };
      break;
    }
    case 'scale': {
      const s = r.numbers?.scales?.find((x: R) => String(x.value) === k);
      if (s) {
        s.word = text;
        if (s.plural !== undefined) s.plural = text;
      }
      break;
    }
    case 'join':
      if (r.numbers?.joiners?.[k]) r.numbers.joiners[k].text = text;
      break;
    case 'word':
      if (r.words && k in r.words) r.words[k] = text;
      break;
    case 'currency': {
      const c = r.money?.currencies?.[k];
      if (c) {
        c.text = text;
        if (c.plural !== undefined) c.plural = text;
      }
      break;
    }
    case 'month': if (r.dates?.months) r.dates.months[Number(k) - 1] = text; break;
    case 'weekday': if (r.dates?.weekdays) r.dates.weekdays[Number(k) - 1] = text; break;
    case 'day': if (r.dates?.days && k in r.dates.days) r.dates.days[k] = text; break;
    case 'rel': if (r.dates?.relative && k in r.dates.relative) r.dates.relative[k] = text; break;
  }
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
