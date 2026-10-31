import type { PackRules } from '@sabitori/core';
import { SpeechRuleError } from './errors.js';
import type { Token } from './tokens.js';

export function wordToken(rules: PackRules, key: string): Token {
  const w = rules.words?.[key];
  if (w === undefined) throw new SpeechRuleError(`rules.words has no "${key}"`);
  return { id: `word.${key}`, text: w };
}
