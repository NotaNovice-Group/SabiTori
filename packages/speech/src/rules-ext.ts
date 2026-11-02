/**
 * Number-rule features that sit on top of the core types (packages/core/src/pack-rules.ts): context
 * specific number sets, and separate clips for bound and plural forms. They are plain JSON fields, so a
 * pack that does not use them is read exactly as before.
 */
import type { JoinChoice, Joiner, NumberOverride, NumberRules, PackRules, ScaleRule } from '@sabitori/core';

/** Where a number is said. Each context may have its own words (many languages count money or days with other forms). */
export type NumberContext = 'money' | 'day' | 'year';
export const NUMBER_CONTEXTS: readonly NumberContext[] = ['money', 'day', 'year'];

export type WordFormX = string | { text: string; bound?: string; /** The bound form has its own clip `num.<n>.bound`. Default: same clip. */ boundClip?: boolean };
export type ScaleRuleX = ScaleRule & { /** The plural form has its own clip `scale.<v>.plural`. Default: same clip. */ pluralClip?: boolean };

/** Entries that differ from the base number system in one context. Everything not listed is inherited. */
export interface NumberOverlay {
  atoms?: Record<string, WordFormX>;
  scales?: ScaleRuleX[];
  joiners?: Record<string, Joiner>;
  join?: JoinChoice[];
  overrides?: Record<string, NumberOverride>;
}

export type NumberRulesX = Omit<NumberRules, 'atoms' | 'scales'> & {
  atoms: Record<string, WordFormX>;
  scales?: ScaleRuleX[];
  contexts?: Partial<Record<NumberContext, NumberOverlay>>;
};

export const asX = (r: NumberRules): NumberRulesX => r as unknown as NumberRulesX;


const none = new WeakSet<object>();
/**
 * "This pack has no rules" (no rules.json). Phrases without slots still play; every slot that needs numbers,
 * money, dates or phones throws SpeechRuleError, so that phrase falls back to another language one by one.
 */
export function noRules(): PackRules {
  const r: PackRules = { formatVersion: 1, numbers: { atoms: {} } };
  none.add(r);
  return r;
}
export const isNoRules = (r: unknown): boolean => typeof r === 'object' && r !== null && none.has(r);
