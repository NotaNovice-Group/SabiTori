/** Locale-aware formatting for history rows. Falls back to fr when the language has no Intl data. */
export function intlLocale(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (Intl.DateTimeFormat.supportedLocalesOf([c]).length) return c;
    } catch {
      /* invalid tag */
    }
  }
  return 'fr';
}

function formatDay(iso: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
  } catch {
    return String(iso ?? ''); // an invalid stored date is shown as it is, never thrown
  }
}

export function formatShortDate(iso: string, locale: string): string {
  return formatDay(iso, locale, { day: 'numeric', month: 'short' });
}

export function formatLongDate(iso: string, locale: string): string {
  return formatDay(iso, locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(locale).format(amount)} ${currency}`;
  }
}

/** "3 days ago". Empty for a missing or invalid date (a damaged history record must not break the list). */
export function formatAgo(iso: string, locale: string, now = Date.now()): string {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const diff = Math.min(0, t - now); // never "in 3 days"
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } catch {
    rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  }
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(hr, 'hour');
  return rtf.format(Math.round(hr / 24), 'day');
}

export function formatSize(bytes: number, locale: string): string {
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes >= 1e9) return `${n.format(bytes / 1e9)} GB`;
  return `${n.format(bytes / 1e6)} MB`;
}

/** +237677123456 -> 677 12 34 56 (display only). */
export function formatPhone(e164: string, countryCode = '237'): string {
  const nat = e164.startsWith('+' + countryCode) ? e164.slice(countryCode.length + 1) : e164.replace(/^\+/, '');
  return nat.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
}

export function todayIso(timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
