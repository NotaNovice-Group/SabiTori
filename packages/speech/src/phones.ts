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

export function phoneTokens(rules: PackRules, value: string, countryCode?: string): Token[] {
  const pr = rules.phones;
  if (!pr) throw new SpeechRuleError('rules.phones is missing');
  const { cc, national } = splitPhone(value, countryCode);
  if (national.length === 0) throw new SpeechRuleError(`phone "${value}" has no digits`);
  const sizes = pr.groupsByLength?.[String(national.length)] ?? pr.groups;
  const groups: string[] = [];
  let pos = 0;
  for (const s of sizes) {
    if (pos >= national.length) break;
    groups.push(national.slice(pos, pos + s));
    pos += s;
  }
  const rest = pr.defaultGroupSize ?? 2;
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
