import { describe, expect, it } from 'vitest';
import { checkPhone, countries } from '../src/lib/phone';

describe('sender phone number', () => {
  it('accepts Cameroonian numbers however they are typed', () => {
    for (const t of ['677 00 12 34', '6 77 00 12 34', '+237 677 00 12 34', '00237677001234', '237-677-00-12-34'])
      expect(checkPhone(t, 'CM'), t).toEqual({ status: 'valid', e164: '+237677001234' });
    expect(checkPhone('222 23 45 67', 'CM')).toEqual({ status: 'valid', e164: '+237222234567' });
  });
  it('says what is wrong with a Cameroonian number', () => {
    expect(checkPhone('67700123', 'CM')).toEqual({ status: 'invalid', reason: 'too_short', expected: 9 });
    expect(checkPhone('6770012345', 'CM')).toEqual({ status: 'invalid', reason: 'too_long', expected: 9 });
    expect(checkPhone('977001234', 'CM')).toMatchObject({ status: 'invalid' });
  });
  it('keeps short codes, and a number with another country code wins over the chosen country', () => {
    expect(checkPhone('8000', 'CM')).toEqual({ status: 'short', value: '8000' });
    expect(checkPhone('+234 803 123 4567', 'CM')).toEqual({ status: 'valid', e164: '+2348031234567' });
    expect(checkPhone('', 'CM')).toEqual({ status: 'empty' });
  });
  it('lists Cameroon first, with its code and flag, named in the person language', () => {
    const fr = countries('fr');
    expect(fr[0]).toMatchObject({ code: 'CM', dial: '237', name: 'Cameroun', flag: '🇨🇲' });
    expect(fr.length).toBeGreaterThan(200);
  });
});
