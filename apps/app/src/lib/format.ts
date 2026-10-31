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

export function formatShortDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
}

export function formatLongDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
}

export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(locale).format(amount)} ${currency}`;
  }
}

export function formatAgo(iso: string, locale: string, now = Date.now()): string {
  const diff = Date.parse(iso) - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
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
