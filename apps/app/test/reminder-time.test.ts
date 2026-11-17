import { describe, expect, it } from 'vitest';
import { planReminders } from '../src/lib/reminders';
import { buildIcs } from '../src/lib/ics';

const now = new Date(2026, 10, 17, 12, 0);
const hm = (d: Date) => `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('reminders for an appointment with a time', () => {
  it('the reminder on the day comes two hours before the appointment', () => {
    expect(planReminders('c1', '2026-11-22', now, '14:30').map((s) => hm(s.at))).toEqual(['21 09:00', '22 12:30']);
    expect(planReminders('c1', '2026-11-22', now, '09:00').map((s) => hm(s.at))).toEqual(['21 09:00', '22 07:00']);
  });
  it('an early appointment: not before 06:00, and always before the appointment', () => {
    expect(planReminders('c1', '2026-11-22', now, '07:30').map((s) => hm(s.at))[1]).toBe('22 06:00');
    expect(planReminders('c1', '2026-11-22', now, '06:00').map((s) => hm(s.at))[1]).toBe('22 05:00');
  });
  it('without a time (or with a bad one) nothing changes: 09:00 the day before, 08:00 on the day', () => {
    for (const t of [undefined, '25:00', '9h', '']) expect(planReminders('c1', '2026-11-22', now, t).map((s) => hm(s.at))).toEqual(['21 09:00', '22 08:00']);
  });
});

describe('calendar file for an appointment with a time', () => {
  const base = { uid: 'c1', date: '2026-11-22' as const, title: 'Hôpital', now: new Date(Date.UTC(2026, 10, 17)) };
  it('is a one-hour event at the local time, with an alert two hours before', () => {
    const ics = buildIcs({ ...base, time: '09:30' });
    expect(ics).toContain('DTSTART:20261122T093000');
    expect(ics).toContain('DTEND:20261122T103000');
    expect(ics).toContain('TRIGGER:-PT2H');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).not.toContain('VALUE=DATE');
  });
  it('23:00 ends the next day; no time stays an all-day event', () => {
    expect(buildIcs({ ...base, time: '23:15' })).toContain('DTEND:20261123T001500');
    const allDay = buildIcs(base);
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261122');
    expect(allDay).not.toContain('PT2H');
  });
});
