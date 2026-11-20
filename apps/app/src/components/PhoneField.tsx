import { useMemo } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js/min';
import { useApp } from '../app-context';
import { checkPhone, countries, type PhoneCheck } from '../lib/phone';

interface Props {
  id: string;
  label: string;
  country: CountryCode;
  onCountry: (c: CountryCode) => void;
  value: string;
  onValue: (v: string) => void;
}

/** Country (flag and dialling code, Cameroon first) and the number, checked as it is typed. */
export function PhoneField({ id, label, country, onCountry, value, onValue }: Props) {
  const { t, locale } = useApp();
  const list = useMemo(() => countries(locale), [locale]);
  const current = list.find((c) => c.code === country) ?? list[0]!;
  const check: PhoneCheck = checkPhone(value, country);
  const msgId = `${id}-msg`;
  const message =
    check.status === 'invalid'
      ? check.reason === 'wrong' || !check.expected
        ? t('app.phone.wrong', { country: current.name })
        : t(check.reason === 'too_short' ? 'app.phone.too_short' : 'app.phone.too_long', { country: current.name, n: String(check.expected) })
      : check.status === 'short'
        ? t('app.phone.short')
        : null;
  return (
    <div className="phone-field">
      <label htmlFor={id} className="field-sublabel">{label}</label>
      <div className="phone-row" data-state={check.status}>
        <label className="phone-cc">
          <span className="sr-only">{t('app.phone.country')}</span>
          <span className="phone-cc-face" aria-hidden="true">
            <span className="phone-flag">{current.flag}</span>
            <span className="num">+{current.dial}</span>
          </span>
          <select value={country} onChange={(e) => onCountry(e.target.value as CountryCode)} aria-label={t('app.phone.country')}>
            {list.map((c) => (
              <option key={c.code} value={c.code}>{`${c.flag} ${c.name} (+${c.dial})`}</option>
            ))}
          </select>
        </label>
        <input
          id={id}
          className="input phone-input num"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          inputMode="tel"
          autoComplete="off"
          placeholder={country === 'CM' ? '6 77 00 12 34' : ''}
          aria-invalid={check.status === 'invalid' || undefined}
          aria-describedby={message ? msgId : undefined}
        />
        {check.status === 'valid' && <CircleCheck className="phone-ok" size={24} strokeWidth={2} aria-label={t('app.phone.ok')} />}
      </div>
      {message && (
        <p id={msgId} className={check.status === 'invalid' ? 'phone-msg phone-msg-bad' : 'phone-msg'} role={check.status === 'invalid' ? 'alert' : undefined}>
          {check.status === 'invalid' && <TriangleAlert size={20} strokeWidth={2} aria-hidden />}
          {message}
        </p>
      )}
    </div>
  );
}

/** What the paste screen stores as the sender: E.164 when the number is valid, the short code, else what was typed. */
export function senderNumber(value: string, country: CountryCode): string {
  const c = checkPhone(value, country);
  return c.status === 'valid' ? c.e164 : c.status === 'short' ? c.value : value.trim();
}
