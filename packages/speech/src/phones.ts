import type { PackRules } from '@sabitori/core';
import { SpeechRuleError } from './errors.js';
import { digitTokens, numberTokens } from './numbers.js';
import type { Token } from './tokens.js';

/** Split a phone value into country code (if recognised) and national digits. */
export function splitPhone(value: string, countryCode?: string): { cc?: string; national: string } {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (countryCode) {
    if (trimmed.startsWith('+') && digits.startsWith(countryCode)) return { cc: countryCode, national: digits.slice(countryCode.length) };
    if (digits.startsWith('00' + countryCode)) return { cc: countryCode, national: digits.slice(2 + countryCode.length) };
  }
  return { national: digits };
}

/** Longest digit string we will read (E.164 allows 15; short codes are shorter). */
export const MAX_PHONE_DIGITS = 20;

/** An international number ("+33612345678", "0033...") that is not from the region: its digits do not follow the region's grouping. */
export function isForeignPhone(value: string, countryCode?: string): boolean {
  if (!countryCode) return false;
  const t = value.trim();
  const digits = t.replace(/\D/g, '');
  if (t.startsWith('+')) return !digits.startsWith(countryCode);
  return digits.startsWith('00') && !digits.startsWith('00' + countryCode);
}

export function phoneTokens(rules: PackRules, value: string, countryCode?: string): Token[] {
  const pr = rules.phones;
  if (!pr) throw new SpeechRuleError('rules.phones is missing');
  if (typeof value !== 'string') throw new SpeechRuleError('phone value must be a string');
  if (isForeignPhone(value, countryCode)) return foreignPhoneTokens(rules, value);
  const { cc, national } = splitPhone(value, countryCode);
  if (national.length === 0) throw new SpeechRuleError('phone has no digits');
  if (national.length > MAX_PHONE_DIGITS) throw new SpeechRuleError(`phone has too many digits (${national.length} > ${MAX_PHONE_DIGITS})`);
  const byLen = pr.groupsByLength;
  const key = String(national.length);
  const sizes = byLen && Object.prototype.hasOwnProperty.call(byLen, key) ? byLen[key] : pr.groups;
  const rest = pr.defaultGroupSize ?? 2;
  const okSize = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 1;
  if (!Array.isArray(sizes) || !sizes.every(okSize) || !okSize(rest)) throw new SpeechRuleError('rules.phones group sizes must be integers of at least 1');
  const groups: string[] = [];
  let pos = 0;
  for (const s of sizes) {
    if (pos >= national.length) break;
    groups.push(national.slice(pos, pos + s));
    pos += s;
  }
  while (pos < national.length) {
    groups.push(national.slice(pos, pos + rest));
    pos += rest;
  }

  const out: Token[] = [];
  const pause = (): void => {
    if (pr.pause) out.push({ id: 'pause.short', text: pr.pause.text, glue: 'left', optional: true });
  };
  if (cc && pr.countryCode === 'say') {
    out.push(...digitTokens(rules.numbers, cc));
    pause();
  }
  groups.forEach((g, i) => {
    if (i > 0) pause();
    const mode = pr.groupRead?.[i] ?? pr.read;
    if (mode === 'digits') {
      out.push(...digitTokens(rules.numbers, g));
    } else {
      const zeros = /^0*/.exec(g)![0];
      out.push(...digitTokens(rules.numbers, zeros));
      if (zeros.length < g.length) out.push(...numberTokens(rules.numbers, Number(g)));
    }
  });
  return out;
}

/**
 * Numbers from another country are not grouped like the region's (a French mobile is not "3, 36, 12 ..."):
 * the country code and the number are read digit by digit in groups of `phones.foreignGroupSize` (default 3).
 */
function foreignPhoneTokens(rules: PackRules, value: string): Token[] {
  const pr = rules.phones!;
  const digits = value.trim().replace(/\D/g, '').replace(/^00/, '');
  if (digits.length === 0) throw new SpeechRuleError('phone has no digits');
  if (digits.length > MAX_PHONE_DIGITS) throw new SpeechRuleError(`phone has too many digits (${digits.length} > ${MAX_PHONE_DIGITS})`);
  const raw = (pr as { foreignGroupSize?: unknown }).foreignGroupSize;
  const size = typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : 3;
  const out: Token[] = [];
  for (let i = 0; i < digits.length; i += size) {
    if (i > 0 && pr.pause) out.push({ id: 'pause.short', text: pr.pause.text, glue: 'left', optional: true });
    out.push(...digitTokens(rules.numbers, digits.slice(i, i + size)));
  }
  return out;
}
