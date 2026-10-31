import type { Money, PackRules } from '@sabitori/core';
import { SpeechRuleError } from './errors.js';
import { numberTokens } from './numbers.js';
import { parseTemplate, type Token } from './tokens.js';
import { wordToken } from './words.js';

export function moneyTokens(rules: PackRules, m: Money): Token[] {
  const mr = rules.money;
  if (!mr) throw new SpeechRuleError('rules.money is missing');
  const cur = mr.currencies[m.currency];
  const singular = (mr.singularFor ?? [1]).includes(m.amount);
  const curText = cur ? (singular ? cur.text : (cur.plural ?? cur.text)) : m.currency;
  const out: Token[] = [];
  for (const part of parseTemplate(mr.template)) {
    if (part.kind === 'word') out.push(wordToken(rules, part.key));
    else if (part.name === 'amount') out.push(...numberTokens(rules.numbers, m.amount));
    else if (part.name === 'currency') out.push({ id: `currency.${m.currency}`, text: curText });
    else if (part.name === 'link') {
      if (mr.link && m.amount > 0 && m.amount % mr.link.multipleOf === 0) out.push(wordToken(rules, mr.link.word));
    } else throw new SpeechRuleError(`unknown money template slot {${part.name}}`);
  }
  return out;
}
