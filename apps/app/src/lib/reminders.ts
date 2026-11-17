import type { IsoDate } from '@sabitori/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

export const REMINDER_CHANNEL = 'reminders';

export type ReminderKind = 'eve' | 'day';
export interface ReminderSlot {
  id: number;
  kind: ReminderKind;
  at: Date;
}

/** FNV-1a, folded to 30 bits, doubled: a stable even id per card, so `+1` is the same card's second reminder. */
export function reminderBaseId(cardId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < cardId.length; i++) {
    h ^= cardId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h & 0x3fffffff) * 2;
}

export function reminderIds(cardId: string): number[] {
  const base = reminderBaseId(cardId);
  return [base, base + 1];
}

/**
 * The reminders for a deadline: 09:00 local the day before, 08:00 local on the day.
 * With a time (an appointment, "HH:MM"), the one on the day comes two hours before it instead, not before 06:00 and
 * always before the appointment. Those already in the past (relative to `now`) are skipped.
 */
export function planReminders(cardId: string, deadline: IsoDate, now: Date = new Date(), time?: string): ReminderSlot[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);
  if (!m) return [];
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  const [eveId, dayId] = reminderIds(cardId) as [number, number];
  const slots: ReminderSlot[] = [
    { id: eveId, kind: 'eve', at: new Date(y, mo - 1, d - 1, 9, 0, 0, 0) },
    { id: dayId, kind: 'day', at: dayReminder(y, mo, d, time) },
  ];
  return slots.filter((s) => s.at.getTime() > now.getTime());
}

function dayReminder(y: number, mo: number, d: number, time?: string): Date {
  const t = time ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time) : null;
  if (!t) return new Date(y, mo - 1, d, 8, 0, 0, 0);
  const appt = new Date(y, mo - 1, d, Number(t[1]), Number(t[2]), 0, 0);
  const early = new Date(y, mo - 1, d, 6, 0, 0, 0);
  const twoBefore = new Date(appt.getTime() - 2 * 3600_000);
  if (twoBefore >= early) return twoBefore;
  // An early appointment: 06:00 if that is still before it, else one hour before.
  return early < appt ? early : new Date(appt.getTime() - 3600_000);
}

export interface ReminderRequest {
  cardId: string;
  deadline: IsoDate;
  /** "HH:MM" of an appointment, when the card has one. */
  time?: string;
  /** Sender name, or "SabiTori". */
  title: string;
  /** The card's action and date, already rendered in the user's language. */
  body: string;
  /** Where a tap goes; defaults to the card. */
  route?: string;
  channelName?: string;
  now?: Date;
}

export type ReminderResult = { status: 'set'; count: number } | { status: 'past' | 'denied' | 'failed' };

/** Asks for the notification permission (Android 13+) — only ever called after the person taps "Remind me". */
async function ensurePermission(): Promise<boolean> {
  let state = (await LocalNotifications.checkPermissions()).display;
  if (state === 'prompt' || state === 'prompt-with-rationale') state = (await LocalNotifications.requestPermissions()).display;
  return state === 'granted';
}

export async function scheduleReminders(req: ReminderRequest): Promise<ReminderResult> {
  try {
    const slots = planReminders(req.cardId, req.deadline, req.now, req.time);
    if (slots.length === 0) return { status: 'past' };
    if (!(await ensurePermission())) return { status: 'denied' };
    await LocalNotifications.createChannel({ id: REMINDER_CHANNEL, name: req.channelName ?? 'SabiTori', importance: 4, visibility: 0 });
    // Replace any earlier reminder of this card.
    await LocalNotifications.cancel({ notifications: reminderIds(req.cardId).map((id) => ({ id })) });
    const notifications: LocalNotificationSchema[] = slots.map((s) => ({
      id: s.id,
      title: req.title,
      body: req.body,
      channelId: REMINDER_CHANNEL,
      // Inexact but allowed while idle: no SCHEDULE_EXACT_ALARM permission, no system prompt.
      schedule: { at: s.at, allowWhileIdle: true },
      isExactNotification: false,
      extra: { cardId: req.cardId, route: req.route ?? `/card/${req.cardId}` },
    }));
    await LocalNotifications.schedule({ notifications });
    return { status: 'set', count: notifications.length };
  } catch {
    return { status: 'failed' };
  }
}

export async function cancelReminders(cardId: string): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: reminderIds(cardId).map((id) => ({ id })) });
  } catch {
    /* nothing pending */
  }
}

export async function hasReminders(cardId: string): Promise<boolean> {
  try {
    const ids = new Set(reminderIds(cardId));
    const { notifications } = await LocalNotifications.getPending();
    return notifications.some((n) => ids.has(n.id));
  } catch {
    return false;
  }
}

/** Where a tapped reminder goes. Only in-app card/practice routes are accepted. */
export function routeFromExtra(extra: unknown): string | null {
  if (!extra || typeof extra !== 'object') return null;
  const { route, cardId } = extra as { route?: unknown; cardId?: unknown };
  if (typeof route === 'string' && /^\/(card\/[^/?#]+|practice)$/.test(route)) return route;
  if (typeof cardId === 'string' && cardId) return `/card/${encodeURIComponent(cardId)}`;
  return null;
}

/** Opens the card when a reminder is tapped (warm start, and cold start through the plugin's retained event). */
export async function listenReminderTaps(open: (route: string) => void): Promise<() => void> {
  const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const route = routeFromExtra(e.notification?.extra);
    if (route) open(route);
  });
  return () => void handle.remove();
}
