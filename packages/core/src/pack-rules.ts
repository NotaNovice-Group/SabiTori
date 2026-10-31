/**
 * Pack rules: how a language says numbers, money, dates and phone numbers.
 * Stored as packs/<tag>/rules.json. Fully documented in docs/pack-rules.md.
 *
 * Design: rules are DATA. The speech package turns a value into a list of
 * tokens; each token has a deterministic clip id ("num.7", "scale.1000",
 * "join.and", "month.11", "weekday.1", "day.12", "currency.XAF",
 * "rel.tomorrow", "word.the", "pause.short") and a text. Text-to-speech packs
 * speak the text; recorded packs play one clip per token. A community adds a
 * language by recording the clips and writing this file. No code change.
 */

/**
 * A word in the number system. A plain string, or an object when the written/
 * spoken form changes depending on what follows it. `text` is used when
 * nothing follows in the same number ("final"); `bound` when more number words
 * follow. French: 80 is { text: "quatre-vingts", bound: "quatre-vingt" }.
 * Both forms use the same clip (the final "s" is silent).
 */
export type WordForm = string | { text: string; bound?: string };

/** Condition on the remainder (the part after the scale or base). All given fields must hold. */
export interface NumberCondition {
  /** Remainder is one of these exact values. */
  remainderEq?: number[];
  /** Remainder is below this value. */
  remainderLt?: number;
  /** Remainder is at least this value. */
  remainderGte?: number;
}

/** Pick a joiner (a key of `joiners`) between two parts of a number. First matching choice wins. */
export interface JoinChoice {
  token: string;
  when?: NumberCondition;
}

/** A joiner word. `silent` joiners (e.g. a hyphen) are glued to their neighbours and have no clip. */
export interface Joiner {
  text: string;
  silent?: boolean;
}

export interface ScaleRule {
  /** 10, 100, 1000, 1000000 ... Clip id is "scale.<value>". */
  value: number;
  /** Singular or invariable form, e.g. "hundred", "cent", "mille". */
  word: string;
  /** Plural form, used according to `pluralWhen`. Same clip as `word`. */
  plural?: string;
  /**
   * When `plural` is used. "never" (default); "multiple" when the multiplier
   * is more than 1; "multiple_final" when the multiplier is more than 1 AND
   * nothing follows ("deux cents" but "deux cent un"; the multiplier of
   * "mille" is not final, the multiplier of "million" is).
   */
  pluralWhen?: 'never' | 'multiple' | 'multiple_final';
  /** Say just the scale word when the multiplier is 1 ("cent", "mille", "ten"). Default false ("un million"). */
  omitOne?: boolean;
  /** Is the multiplier phrase "final" for WordForm.bound / plural purposes? Default false. */
  multiplierFinal?: boolean;
  /** Multiplier before the scale (default: "deux cents") or after it ("hundred two"). */
  order?: 'multiplier_first' | 'scale_first';
  /** Joiner between this scale phrase and the remainder, e.g. "and" for remainder < 100. */
  join?: JoinChoice[];
}

/** One item of an explicit token sequence. */
export type SayItem =
  | { atom: number }
  | { scale: number }
  | { join: string }
  /** Render this number with the normal rules (recursion). */
  | { number: number };

/**
 * Irregular numbers. Keyed by an exact number ("80") or an inclusive range
 * ("70-79"). Exact keys win over ranges; among ranges the first in file order.
 */
export interface NumberOverride {
  /** Say exactly this. */
  say?: SayItem[];
  /**
   * Say `base` (with its non-final form), a joiner, then the rest (n - base)
   * with the normal rules. French 70-79: base 60; 80-99: base 80.
   */
  base?: number;
  /** Joiner choices after `base`. Default: the top-level `join`. */
  join?: JoinChoice[];
}

export interface NumberRules {
  /** Words for 0-9 are required (used for digit-by-digit reading). Key = the number. Clip id "num.<n>". */
  atoms: Record<string, WordForm>;
  /** Multiplicative words, e.g. hundred, thousand, million. */
  scales?: ScaleRule[];
  /** Joiner words by key. Clip id "join.<key>" unless silent. */
  joiners?: Record<string, Joiner>;
  /** Default joiner between an atom and the rest, below the smallest scale (e.g. "twenty" + "one"). */
  join?: JoinChoice[];
  overrides?: Record<string, NumberOverride>;
}

export interface CurrencyWord {
  /** Singular (or only) form, e.g. "CFA franc". */
  text: string;
  /** Plural form, e.g. "CFA francs". Same clip. */
  plural?: string;
}

export interface MoneyRules {
  /**
   * Order of the parts, space separated: {amount} {currency} {link} {w:key}.
   * "{amount} {link} {currency}" or "{currency} {amount}".
   */
  template: string;
  /** Currency words by ISO 4217 code. Clip id "currency.<CODE>". */
  currencies: Record<string, CurrencyWord>;
  /** Amounts for which the singular form is used. Default [1]. French: [0, 1]. */
  singularFor?: number[];
  /** A linking word (a key of `words`) inserted at {link} when the amount is a multiple of `multipleOf` ("un million DE francs"). */
  link?: { word: string; multipleOf: number };
}

export interface DateTemplates {
  /** With year. Parts: {day} {month} {year} {weekday} {w:key}, space separated. */
  full: string;
  /** Without year (used when the year is the current year and omitCurrentYear is true). */
  noYear: string;
  fullWeekday?: string;
  noYearWeekday?: string;
}

export interface DateRules {
  /** 12 names, January first. Clip ids "month.1" .. "month.12". */
  months: string[];
  /** 7 names, Monday first (ISO). Clip ids "weekday.1" .. "weekday.7". */
  weekdays?: string[];
  /** Day-of-month words overriding the number rules, keyed "1".."31" (ordinals, "premier"). Clip "day.<n>". */
  days?: Record<string, string>;
  templates: DateTemplates;
  /** Leave the year out when it equals the year of today / `relativeTo`. Default true. */
  omitCurrentYear?: boolean;
  /** Use the *Weekday templates. Default false. */
  includeWeekday?: boolean;
  /** "cardinal": two thousand twenty-seven. "century_pairs": twenty twenty-seven (2000-2009 stay cardinal). */
  yearStyle?: 'cardinal' | 'century_pairs';
  /** Replace the whole date by a word when it is today, tomorrow or yesterday. Clip "rel.today" etc. */
  relative?: { today?: string; tomorrow?: string; yesterday?: string };
}

export interface PhoneRules {
  /** Say the country code (digit by digit) when the number carries one. Default "omit": read the national number. */
  countryCode?: 'omit' | 'say';
  /** Default group sizes of the national number, e.g. [1,2,2,2,2] for 9 digits. */
  groups: number[];
  /** Group sizes by number of digits ("4": [2,2]); overrides `groups`. */
  groupsByLength?: Record<string, number[]>;
  /** Used for digits beyond the group sizes. Default 2. */
  defaultGroupSize?: number;
  /** How a group is read: as a number ("soixante-dix-sept") or digit by digit. */
  read: 'number' | 'digits';
  /** Per-group override of `read` (by group index). */
  groupRead?: ('number' | 'digits')[];
  /**
   * Pause between groups. `text` is the punctuation written/spoken by TTS
   * (","). Recorded packs may supply a short silent clip "pause.short"; it is
   * optional and skipped when absent.
   */
  pause?: { text: string };
}

export interface PackRules {
  formatVersion: 1;
  numbers: NumberRules;
  money?: MoneyRules;
  dates?: DateRules;
  phones?: PhoneRules;
  /** Small words used by templates as {w:key}. Clip id "word.<key>". */
  words?: Record<string, string>;
}
