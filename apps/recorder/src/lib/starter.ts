/**
 * The neutral starting point for a language's number and date rules.
 *
 * It does NOT copy English: no "hundred and", no "twenty twenty-seven", no ordinals, no plural forms. It asks the
 * speakers how their language does the few things that differ, builds a rules.json whose words are placeholders
 * (the digits, "month 3", ...), and the speakers write and record the real word of every clip on the Numbers page.
 * Anything the questions do not cover can be edited later under Pack, or added as a bound/plural form or a
 * context-specific number set (docs/pack-rules.md).
 */
import type { PackRules } from '@sabitori/core';

export interface StarterAnswers {
  /** How a year such as 2027 is said. */
  yearStyle: 'cardinal' | 'century_pairs';
  /** Which comes first in a date. */
  dateOrder: 'day_month' | 'month_day';
  /** Do days of the month have their own words (first, second ...) or are they the plain numbers? */
  dayWords: 'numbers' | 'own_words';
  /** Where the money word goes. */
  moneyOrder: 'amount_first' | 'currency_first';
  /** Is there a word that joins the parts of a number ("hundred AND five")? */
  joiner: boolean;
  /** Number sets that have their own words when counting money, days, or in years. */
  ownWords: { money: boolean; day: boolean; year: boolean };
}

export const DEFAULT_ANSWERS: StarterAnswers = {
  yearStyle: 'cardinal',
  dateOrder: 'day_month',
  dayWords: 'numbers',
  moneyOrder: 'amount_first',
  joiner: false,
  ownWords: { money: false, day: false, year: false },
};

const digits = (): Record<string, string> => Object.fromEntries([...'0123456789'].map((d) => [d, d]));

export function neutralRules(a: StarterAnswers = DEFAULT_ANSWERS): PackRules {
  const atoms: Record<string, string> = { ...digits(), '10': '10' };
  for (const t of [20, 30, 40, 50, 60, 70, 80, 90]) atoms[String(t)] = String(t);
  const join = a.joiner ? [{ token: 'and', when: { remainderLt: 100 } }] : undefined;
  const scale = (value: number) => ({ value, word: String(value), ...(join ? { join } : {}) });
  const days = a.dayWords === 'own_words' ? Object.fromEntries(Array.from({ length: 31 }, (_, i) => [String(i + 1), `day ${i + 1}`])) : undefined;
  const contexts: Record<string, { atoms: Record<string, string> }> = {};
  for (const c of ['money', 'day', 'year'] as const) if (a.ownWords[c]) contexts[c] = { atoms: digits() };
  const rules = {
    formatVersion: 1,
    numbers: {
      atoms,
      ...(a.joiner ? { joiners: { and: { text: 'joining word' } } } : {}),
      scales: [scale(100), scale(1000), scale(1_000_000)],
      ...(Object.keys(contexts).length ? { contexts } : {}),
    },
    money: {
      template: a.moneyOrder === 'currency_first' ? '{currency} {amount}' : '{amount} {currency}',
      currencies: { XAF: { text: 'money word' } },
    },
    dates: {
      months: Array.from({ length: 12 }, (_, i) => `month ${i + 1}`),
      weekdays: Array.from({ length: 7 }, (_, i) => `weekday ${i + 1}`),
      ...(days ? { days } : {}),
      templates: a.dateOrder === 'month_day' ? { full: '{month} {day} {year}', noYear: '{month} {day}' } : { full: '{day} {month} {year}', noYear: '{day} {month}' },
      omitCurrentYear: true,
      yearStyle: a.yearStyle,
      relative: { today: 'today', tomorrow: 'tomorrow', yesterday: 'yesterday' },
    },
    phones: { countryCode: 'omit', groups: [1, 2, 2, 2, 2], defaultGroupSize: 2, read: 'number' },
  };
  return rules as unknown as PackRules;
}

/** The least valid rules.json: the digits 0-9. Used when a project has no (valid) rules, so an export always has one. */
export function minimalRules(): PackRules {
  return { formatVersion: 1, numbers: { atoms: digits() } };
}
