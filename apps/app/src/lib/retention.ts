const DAY = 24 * 60 * 60 * 1000;

/** Ids of records older than `days` (0 = keep nothing). */
export function expiredIds(records: { id: string; createdAt: string }[], days: number, now = Date.now()): string[] {
  if (days <= 0) return records.map((r) => r.id);
  const cutoff = now - days * DAY;
  return records.filter((r) => {
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) && t < cutoff;
  }).map((r) => r.id);
}
