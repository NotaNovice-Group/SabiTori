/**
 * Scam alerts (docs/updates.md, "Scam alerts"): short warnings the project publishes in `regions/<CC>/alerts.json`
 * over the signed update channel. Phones that switched updates on receive them with their daily check; nothing is
 * sent from the phone, no account, no device token. New alerts are shown as a notification (only if notifications
 * are already allowed: SabiTori never asks for that permission for alerts) and on the Scams screen.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { parseAlerts, type ScamAlert } from '@sabitori/connect';
import { connectedAssets } from './updates';
import { isNative, nativePlatform } from './native';

const SEEN = 'sabitori.alerts.seen.v1';
export const ALERT_CHANNEL = 'scam-alerts';
/** Notification ids for alerts start here (reminders use even ids from a hash; this block is never used by them). */
const ALERT_ID_BASE = 2_100_000_001;

/** Alerts still current today, newest first. */
export function currentAlerts(alerts: ScamAlert[], today: string): ScamAlert[] {
  return alerts.filter((a) => a.date <= today && today <= a.expires).sort((a, b) => b.date.localeCompare(a.date));
}

/** Current alerts this phone has not shown yet. */
export function unseen(alerts: ScamAlert[], seen: string[], today: string): ScamAlert[] {
  return currentAlerts(alerts, today).filter((a) => !seen.includes(a.id));
}

const readSeen = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const writeSeen = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN, JSON.stringify(ids.slice(-100)));
  } catch {
    /* kept for this session only */
  }
};

/** The region's alerts: the downloaded copy when there is one, else the one built into the app. Never throws. */
export async function loadAlerts(region: string, base = import.meta.env.BASE_URL): Promise<ScamAlert[]> {
  const url = `${base}regions/${region}/alerts.json`;
  try {
    const assets = connectedAssets();
    const r = assets ? await assets.fetch(url) : await fetch(url);
    if (!r.ok) return [];
    return parseAlerts(await r.json());
  } catch {
    return [];
  }
}

/** Shows the alerts this phone has not shown yet, as notifications; marks them seen. Never throws, never asks. */
export async function notifyNewAlerts(region: string, lang: string, today: string): Promise<number> {
  const fresh = unseen(await loadAlerts(region), readSeen(), today);
  if (!fresh.length) return 0;
  writeSeen([...readSeen(), ...fresh.map((a) => a.id)]);
  if (!isNative()) return fresh.length;
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return fresh.length;
    if (nativePlatform() === 'android') await LocalNotifications.createChannel({ id: ALERT_CHANNEL, name: 'Scam alerts', importance: 4, visibility: 1 });
    const l = lang === 'en' ? 'en' : 'fr';
    await LocalNotifications.schedule({
      notifications: fresh.slice(0, 3).map((a, i) => ({
        id: ALERT_ID_BASE + i,
        title: a.title[l],
        body: a.body[l],
        channelId: ALERT_CHANNEL,
        extra: { route: '/scams' },
      })),
    });
  } catch {
    /* shown on the Scams screen anyway */
  }
  return fresh.length;
}
