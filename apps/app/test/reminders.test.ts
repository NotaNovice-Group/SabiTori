import { beforeEach, describe, expect, it, vi } from 'vitest';

const ln = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(async (_o?: unknown) => undefined),
  cancel: vi.fn(async (_o?: unknown) => undefined),
  schedule: vi.fn(async (_o?: unknown) => ({ notifications: [] })),
  getPending: vi.fn(),
  addListener: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));

import { cancelReminders, hasReminders, listenReminderTaps, planReminders, reminderIds, routeFromExtra, scheduleReminders } from '../src/lib/reminders';

const at = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];

describe('planReminders', () => {
  it('09:00 local the day before and 08:00 local on the day', () => {
    const [eve, day] = planReminders('c1', '2026-11-05', new Date(2026, 10, 1, 12, 0));
    expect(eve!.kind).toBe('eve');
    expect(at(eve!.at)).toEqual([2026, 11, 4, 9, 0]);
    expect(day!.kind).toBe('day');
    expect(at(day!.at)).toEqual([2026, 11, 5, 8, 0]);
  });

  it('crosses month and year boundaries', () => {
    const [eve] = planReminders('c1', '2027-01-01', new Date(2026, 11, 1));
    expect(at(eve!.at)).toEqual([2026, 12, 31, 9, 0]);
  });

  it('skips the eve reminder once 09:00 the day before has passed', () => {
    const slots = planReminders('c1', '2026-11-05', new Date(2026, 10, 4, 9, 30));
    expect(slots.map((s) => s.kind)).toEqual(['day']);
  });

  it('skips a reminder exactly at now', () => {
    expect(planReminders('c1', '2026-11-05', new Date(2026, 10, 4, 9, 0)).map((s) => s.kind)).toEqual(['day']);
  });

  it('skips everything for a deadline that is today after 08:00 or already past', () => {
    expect(planReminders('c1', '2026-11-05', new Date(2026, 10, 5, 8, 1))).toEqual([]);
    expect(planReminders('c1', '2026-10-01', new Date(2026, 10, 5))).toEqual([]);
  });

  it('keeps the day reminder when the deadline is tomorrow morning', () => {
    const slots = planReminders('c1', '2026-11-02', new Date(2026, 10, 1, 10, 0));
    expect(slots.map((s) => s.kind)).toEqual(['day']);
  });

  it('ignores a malformed date', () => {
    expect(planReminders('c1', 'soon' as never)).toEqual([]);
  });

  it('gives each card two stable, distinct, positive 32-bit ids', () => {
    const [a, b] = reminderIds('card-1');
    expect(reminderIds('card-1')).toEqual([a, b]);
    expect(b).toBe(a! + 1);
    expect(a! % 2).toBe(0);
    for (const id of [a!, b!]) expect(id).toBeGreaterThan(0), expect(id).toBeLessThan(2 ** 31);
    expect(reminderIds('card-2')[0]).not.toBe(a);
  });
});

describe('scheduleReminders', () => {
  const now = new Date(2026, 10, 1, 12, 0);
  const req = { cardId: 'c1', deadline: '2026-11-05' as const, title: 'ENEO', body: 'Pay the bill. Before 5 November.', now };
  beforeEach(() => {
    vi.clearAllMocks();
    ln.checkPermissions.mockResolvedValue({ display: 'granted' });
    ln.requestPermissions.mockResolvedValue({ display: 'granted' });
  });

  it('schedules two inexact, idle-allowed notifications that open the card', async () => {
    expect(await scheduleReminders(req)).toEqual({ status: 'set', count: 2 });
    const { notifications } = ln.schedule.mock.calls[0]![0] as { notifications: Array<Record<string, any>> };
    expect(notifications).toHaveLength(2);
    for (const n of notifications) {
      expect(n.title).toBe('ENEO');
      expect(n.body).toBe(req.body);
      expect(n.schedule.allowWhileIdle).toBe(true);
      expect(n.isExactNotification).toBe(false);
      expect(n.extra).toEqual({ cardId: 'c1', route: '/card/c1' });
    }
    expect(at(notifications[0]!.schedule.at)).toEqual([2026, 11, 4, 9, 0]);
    expect(at(notifications[1]!.schedule.at)).toEqual([2026, 11, 5, 8, 0]);
    expect(ln.requestPermissions).not.toHaveBeenCalled();
  });

  it('asks for permission only when it is still undecided, and reports a refusal', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'prompt' });
    ln.requestPermissions.mockResolvedValue({ display: 'denied' });
    expect(await scheduleReminders(req)).toEqual({ status: 'denied' });
    expect(ln.requestPermissions).toHaveBeenCalledTimes(1);
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  it('does not even ask for permission when every time is in the past', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'prompt' });
    expect(await scheduleReminders({ ...req, now: new Date(2026, 10, 6) })).toEqual({ status: 'past' });
    expect(ln.requestPermissions).not.toHaveBeenCalled();
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  it('schedules only the future one', async () => {
    expect(await scheduleReminders({ ...req, now: new Date(2026, 10, 4, 10, 0) })).toEqual({ status: 'set', count: 1 });
  });

  it('reports a plugin failure instead of throwing', async () => {
    ln.schedule.mockRejectedValueOnce(new Error('boom'));
    expect(await scheduleReminders(req)).toEqual({ status: 'failed' });
  });

  it('cancels both ids and finds them pending', async () => {
    await cancelReminders('c1');
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: reminderIds('c1').map((id) => ({ id })) });
    ln.getPending.mockResolvedValue({ notifications: [{ id: reminderIds('c1')[1] }] });
    expect(await hasReminders('c1')).toBe(true);
    ln.getPending.mockResolvedValue({ notifications: [{ id: 5 }] });
    expect(await hasReminders('c1')).toBe(false);
  });
});

describe('tapping a reminder', () => {
  it('only accepts in-app routes', () => {
    expect(routeFromExtra({ cardId: 'abc', route: '/card/abc' })).toBe('/card/abc');
    expect(routeFromExtra({ cardId: 'abc', route: '/practice' })).toBe('/practice');
    expect(routeFromExtra({ cardId: 'a b' })).toBe('/card/a%20b');
    expect(routeFromExtra({ route: 'https://evil.example' })).toBeNull();
    expect(routeFromExtra(undefined)).toBeNull();
  });

  it('opens the card from the plugin event', async () => {
    let fn: (e: any) => void = () => undefined;
    const remove = vi.fn();
    ln.addListener.mockImplementation(async (_n: string, f: (e: any) => void) => ((fn = f), { remove }));
    const open = vi.fn();
    const off = await listenReminderTaps(open);
    fn({ actionId: 'tap', notification: { extra: { cardId: 'c9', route: '/card/c9' } } });
    fn({ actionId: 'tap', notification: {} });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('/card/c9');
    off();
    expect(remove).toHaveBeenCalled();
  });
});
