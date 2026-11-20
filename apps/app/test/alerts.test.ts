import { describe, expect, it } from 'vitest';
import type { ScamAlert } from '@sabitori/connect';
import { currentAlerts, unseen } from '../src/lib/alerts';
import { limitNotice } from '../src/lib/relay';

const a = (id: string, date: string, expires: string): ScamAlert => ({ id, date, expires, title: { fr: id, en: id }, body: { fr: id, en: id } });

describe('scam alerts on the phone', () => {
  const list = [a('old', '2026-10-01', '2026-10-31'), a('now', '2026-11-18', '2026-12-18'), a('newer', '2026-11-20', '2026-12-20'), a('later', '2026-12-01', '2026-12-31')];
  it('shows only current alerts, newest first', () => {
    expect(currentAlerts(list, '2026-11-20').map((x) => x.id)).toEqual(['newer', 'now']);
  });
  it('notifies only alerts not shown before', () => {
    expect(unseen(list, ['now'], '2026-11-20').map((x) => x.id)).toEqual(['newer']);
    expect(unseen(list, ['now', 'newer'], '2026-11-20')).toEqual([]);
  });
});

describe('relay limit notice', () => {
  it('at most once an hour', () => {
    const s: { lastLimitNote?: number } = {};
    expect(limitNotice(s, 0)).toBe(true);
    expect(limitNotice(s, 60_000)).toBe(false);
    expect(limitNotice(s, 3_600_001)).toBe(true);
  });
});
