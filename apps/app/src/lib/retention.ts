const DAY = 24 * 60 * 60 * 1000;
/** A record dated further ahead than this was written by a phone with a wrong clock, or by someone else. */
const FUTURE_SLACK = DAY;

export interface RetentionRecord {
  id: string;
  createdAt: unknown;
  /** A reminder keeps the card until the end of this day (YYYY-MM-DD), whatever the retention says. */
  keepUntil?: unknown;
}

/** End of a YYYY-MM-DD day, local time; NaN when it is not such a date. */
function endOfDay(iso: unknown): number {
  if (typeof iso !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime();
}

/**
 * Ids of records to delete: older than `days` (0 = keep nothing), and also any record whose date is
 * missing, invalid or in the future (they cannot be shown or aged honestly). A record with a reminder
 * (`keepUntil`, the deadline) is kept until that day is over.
 */
export function expiredIds(records: RetentionRecord[], days: number, now = Date.now()): string[] {
  const cutoff = now - days * DAY;
  return records
    .filter((r) => {
      const t = typeof r.createdAt === 'string' ? Date.parse(r.createdAt) : NaN;
      if (!Number.isFinite(t) || t > now + FUTURE_SLACK) return true;
      if (endOfDay(r.keepUntil) >= now) return false;
      return days <= 0 || t < cutoff;
    })
    .map((r) => r.id);
}

/** Enough of a card for the history list and the card screen to show it without throwing. */
export function isCardRecord(v: unknown): boolean {
  const c = v as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return false;
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
  const str = (x: unknown) => typeof x === 'string';
  const input = c.input, und = c.understanding, scam = c.scam, sender = c.sender;
  return (
    str(c.id) && str(c.createdAt) && str(c.mode) &&
    obj(input) && str(input.text) &&
    obj(und) && str(und.kind) && str(und.urgency) &&
    obj(scam) && str(scam.level) &&
    obj(sender)
  );
}
