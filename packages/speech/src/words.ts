import type { PackRules } from '@sabitori/core';
import { SpeechRuleError } from './errors.js';
import type { Token } from './tokens.js';

export function wordToken(rules: PackRules, key: string): Token {
  const words = rules.words;
  const w = words && Object.prototype.hasOwnProperty.call(words, key) ? words[key] : undefined;
  if (typeof w !== 'string') throw new SpeechRuleError(`rules.words has no "${key}"`);
  return { id: `word.${key}`, text: w };
}
