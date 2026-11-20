/**
 * Relay mode (relay build only, VITE_RELAY=1; docs/sms-ussd.md route A). This phone answers SMS that people forward
 * to it: the card is made here, offline, and sent back by SMS. Message texts are never stored or logged: only counts.
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { chooseLang, composeReply } from '@sabitori/gateway/compose';
import type { Engine } from '../engine';
import { buildInput } from './open';

export const relayEnabled = (env: Record<string, string | undefined>): boolean => (env.VITE_RELAY ?? '').trim() === '1';

interface SmsRelayPlugin {
  available(): Promise<{ available: boolean }>;
  start(): Promise<{ available: boolean; running?: boolean; denied?: boolean }>;
  stop(): Promise<void>;
  send(opts: { to: string; text: string }): Promise<{ parts: number }>;
  addListener(event: 'sms', fn: (e: { from: string; text: string }) => void): Promise<PluginListenerHandle>;
}
export const SmsRelay = registerPlugin<SmsRelayPlugin>('SmsRelay');

/** Limits that keep a relay SIM safe and cheap: no loops with services, no flood from one number. */
export const LIMITS = { perNumberPerHour: 5, perHour: 60, maxChars: 2000 } as const;

export type Refusal = 'not_mobile' | 'empty' | 'too_long' | 'number_limit' | 'hour_limit';

export interface RelayState {
  /** epoch ms of replies, per number and in total; kept in memory only, for the limits. */
  byNumber: Map<string, number[]>;
  all: number[];
}
export const newRelayState = (): RelayState => ({ byNumber: new Map(), all: [] });

/**
 * Whether to answer. Only an ordinary Cameroonian mobile number gets a reply: never a short code, a company name
 * ("MTN", "ENEO") or a foreign number (no loops with services, no international SMS charges).
 */
export function decide(from: string, text: string, state: RelayState, now: number): { ok: true; to: string } | { ok: false; why: Refusal } {
  const digits = from.replace(/[^\d+]/g, '');
  const m = /^(?:\+?237|00237)?(6\d{8})$/.exec(digits);
  if (!m) return { ok: false, why: 'not_mobile' };
  if (!text.trim()) return { ok: false, why: 'empty' };
  if (text.length > LIMITS.maxChars) return { ok: false, why: 'too_long' };
  const hourAgo = now - 3_600_000;
  const to = `+237${m[1]}`;
  const mine = (state.byNumber.get(to) ?? []).filter((t) => t > hourAgo);
  state.all = state.all.filter((t) => t > hourAgo);
  if (mine.length >= LIMITS.perNumberPerHour) return { ok: false, why: 'number_limit' };
  if (state.all.length >= LIMITS.perHour) return { ok: false, why: 'hour_limit' };
  mine.push(now);
  state.byNumber.set(to, mine);
  state.all.push(now);
  return { ok: true, to };
}

/** The reply SMS for one forwarded message: the same card as on screen, as at most 3 SMS. */
export async function relayReply(engine: Engine, text: string, today: string): Promise<{ text: string; parts: number; scam: string }> {
  const first = chooseLang(text, 'fr');
  const card = await engine.analyze(buildInput(first.body, 'share', engine.region.code, undefined, today));
  const { lang } = chooseLang(text, card.facts.lang);
  const views = await engine.renderCard(card, lang);
  const r = composeReply(views.map((v) => v.text), lang);
  return { ...r, scam: card.scam.level };
}

/** Relay status notifications, on the relay phone itself (local, no server). */
const RELAY_CHANNEL = 'relay';
export const RELAY_NOTE_ID = 2_100_000_101;
export const RELAY_LIMIT_ID = 2_100_000_102;

async function canNotify(ask: boolean): Promise<boolean> {
  try {
    let s = (await LocalNotifications.checkPermissions()).display;
    if (ask && (s === 'prompt' || s === 'prompt-with-rationale')) s = (await LocalNotifications.requestPermissions()).display;
    if (s !== 'granted') return false;
    await LocalNotifications.createChannel({ id: RELAY_CHANNEL, name: 'SMS relay', importance: 2, visibility: 1 });
    return true;
  } catch {
    return false;
  }
}

/** While relaying: a quiet, ongoing notification, so the owner sees at a glance that this phone is answering. */
export async function showRelayRunning(title: string, body: string): Promise<void> {
  if (!(await canNotify(true))) return;
  try {
    await LocalNotifications.schedule({ notifications: [{ id: RELAY_NOTE_ID, title, body, channelId: RELAY_CHANNEL, ongoing: true, autoCancel: false }] });
  } catch {
    /* the screen shows the status anyway */
  }
}

export async function clearRelayNotes(): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: RELAY_NOTE_ID }, { id: RELAY_LIMIT_ID }] });
  } catch {
    /* nothing shown */
  }
}

/** The hourly limit was reached: tell the owner once per hour (messages get no answer until the hour passes). */
export function limitNotice(state: { lastLimitNote?: number }, now: number): boolean {
  if (state.lastLimitNote !== undefined && now - state.lastLimitNote < 3_600_000) return false;
  state.lastLimitNote = now;
  return true;
}
export async function showRelayLimit(title: string, body: string): Promise<void> {
  if (!(await canNotify(false))) return;
  try {
    await LocalNotifications.schedule({ notifications: [{ id: RELAY_LIMIT_ID, title, body, channelId: RELAY_CHANNEL }] });
  } catch {
    /* counted on the screen anyway */
  }
}
