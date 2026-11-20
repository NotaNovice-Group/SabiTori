import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

/** Countries people in Cameroon most often get messages from: listed first, in this order. */
const NEAR: CountryCode[] = ['CM', 'NG', 'GA', 'TD', 'CF', 'CG', 'GQ', 'CD', 'FR', 'BE', 'CI', 'SN', 'GH', 'US', 'GB', 'CA', 'DE', 'CN'];

export interface Country {
  code: CountryCode;
  dial: string;
  name: string;
  flag: string;
}

const flagOf = (cc: string) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/** Every country, the near ones first, named in the person's language. */
export function countries(locale: string): Country[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  } catch {
    /* old engine: codes only */
  }
  const make = (code: CountryCode): Country => ({ code, dial: getCountryCallingCode(code), name: names?.of(code) ?? code, flag: flagOf(code) });
  const near = NEAR.map(make);
  const rest = getCountries()
    .filter((c) => !NEAR.includes(c))
    .map(make)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return [...near, ...rest];
}

export type PhoneCheck =
  | { status: 'empty' }
  | { status: 'valid'; e164: string }
  /** A short code ("8000"): operators and services send from these. Kept as typed. */
  | { status: 'short'; value: string }
  | { status: 'invalid'; reason: 'too_short' | 'too_long' | 'wrong'; expected?: number };

/** Digits a typical mobile number of this country has, for the error message (Cameroon: 9). */
function expectedLength(country: CountryCode): number | undefined {
  const ex: Partial<Record<CountryCode, number>> = { CM: 9, NG: 10, GA: 8, TD: 8, CF: 8, CG: 9, GQ: 9, CD: 9, FR: 9, BE: 9, CI: 10, SN: 9, GH: 9, US: 10, GB: 10, CA: 10 };
  return ex[country];
}

/**
 * Checks a number typed for a chosen country. Accepts it with or without the country code, spaces or dashes
 * ("677 00 12 34", "+237677001234", "00237 6 77 00 12 34"). A number typed with another country's code wins over
 * the chosen country (someone in Cameroon pasting a Nigerian number).
 */
export function checkPhone(raw: string, country: CountryCode): PhoneCheck {
  const typed = raw.trim();
  if (!typed) return { status: 'empty' };
  const digits = typed.replace(/[^\d+]/g, '').replace(/^00/, '+');
  const bare = digits.replace(/\D/g, '');
  if (!digits.startsWith('+') && bare.length >= 3 && bare.length <= 6) return { status: 'short', value: bare };
  const n = parsePhoneNumberFromString(digits, country);
  if (n?.isValid()) return { status: 'valid', e164: n.number };
  const expected = expectedLength(n?.country ?? country);
  const national = n?.nationalNumber ?? bare;
  if (expected && national.length < expected) return { status: 'invalid', reason: 'too_short', expected };
  if (expected && national.length > expected) return { status: 'invalid', reason: 'too_long', expected };
  return { status: 'invalid', reason: 'wrong', ...(expected ? { expected } : {}) };
}
