import type { Money, PackRules } from '@sabitori/core';
import { SpeechRuleError } from './errors.js';
import { numberTokens } from './numbers.js';
import { parseTemplate, type Token } from './tokens.js';
import { wordToken } from './words.js';

/** A currency word as written in rules.json. `pluralClip` gives the plural form its own clip `currency.<CODE>.plural`. */
type CurrencyX = { text: string; plural?: string; pluralClip?: boolean };

export function moneyTokens(rules: PackRules, m: Money): Token[] {
  const mr = rules.money;
  if (!mr) throw new SpeechRuleError('rules.money is missing');
  const cur = (Object.prototype.hasOwnProperty.call(mr.currencies, m.currency) ? mr.currencies[m.currency] : undefined) as CurrencyX | undefined;
  if (cur !== undefined && (typeof cur.text !== 'string' || (cur.plural !== undefined && typeof cur.plural !== 'string'))) {
    throw new SpeechRuleError(`rules.money.currencies.${m.currency} has no text`);
  }
  const singular = (Array.isArray(mr.singularFor) ? mr.singularFor : [1]).includes(m.amount);
  const curText = cur ? (singular ? cur.text : (cur.plural ?? cur.text)) : m.currency;
  const curId = cur && !singular && cur.plural !== undefined && cur.pluralClip ? `currency.${m.currency}.plural` : `currency.${m.currency}`;
  const out: Token[] = [];
  for (const part of parseTemplate(mr.template)) {
    if (part.kind === 'word') out.push(wordToken(rules, part.key));
    // Amounts must be whole numbers the rules can really compose: a larger one is an error (the phrase falls back), never digits.
    else if (part.name === 'amount') out.push(...numberTokens(rules.numbers, m.amount, { context: 'money', overflow: 'throw' }));
    else if (part.name === 'currency') out.push({ id: curId, text: curText });
    else if (part.name === 'link') {
      if (mr.link && m.amount > 0 && m.amount % mr.link.multipleOf === 0) out.push(wordToken(rules, mr.link.word));
    } else throw new SpeechRuleError(`unknown money template slot {${part.name}}`);
  }
  return out;
}
