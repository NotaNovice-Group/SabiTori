/**
 * Instant scam alerts (docs/updates.md, "Instant scam alerts"), optional and off by default, in builds made with a
 * Firebase project (VITE_PUSH=1 and google-services.json). Switched on, the phone subscribes to one topic, its
 * region and language ("alerts-CM-fr"): Google's Firebase Cloud Messaging delivers the alert the moment the project
 * publishes it. SabiTori never receives or stores the device token; switching off deletes it.
 * Only the native plugin is used (no Firebase web library in the app).
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isSafeAlertText } from '@sabitori/connect';
import { isNative, nativePlatform } from './native';
import { ALERT_CHANNEL } from './alerts';

export const pushEnabled = (env: Record<string, string | undefined>): boolean => (env.VITE_PUSH ?? '').trim() === '1';

interface FirebaseMessagingPlugin {
  requestPermissions(): Promise<{ receive: string }>;
  subscribeToTopic(o: { topic: string }): Promise<void>;
  unsubscribeFromTopic(o: { topic: string }): Promise<void>;
  deleteToken(): Promise<void>;
  addListener(event: 'notificationReceived', fn: (e: { notification: { title?: string; body?: string; data?: unknown } }) => void): Promise<PluginListenerHandle>;
}
const Fcm = registerPlugin<FirebaseMessagingPlugin>('FirebaseMessaging');

/** One topic per region and language, so no list of phones exists anywhere. */
export const topicFor = (region: string, lang: string): string => `alerts-${region.replace(/[^A-Z]/g, '') || 'CM'}-${lang === 'en' ? 'en' : 'fr'}`;

export type PushResult = 'on' | 'denied' | 'failed';

export async function pushOn(region: string, lang: string): Promise<PushResult> {
  if (!isNative()) return 'failed';
  try {
    if ((await Fcm.requestPermissions()).receive !== 'granted') return 'denied';
    await Fcm.subscribeToTopic({ topic: topicFor(region, lang) });
    await listenForeground();
    return 'on';
  } catch {
    return 'failed';
  }
}

/** Unsubscribes and deletes the token: Firebase forgets this phone. */
export async function pushOff(region: string, lang: string): Promise<void> {
  if (!isNative()) return;
  try {
    await Fcm.unsubscribeFromTopic({ topic: topicFor(region, lang) });
  } catch {
    /* not subscribed */
  }
  try {
    await Fcm.deleteToken();
  } catch {
    /* no token */
  }
}

/** The language changed: move to the other topic. */
export async function pushMove(region: string, from: string, to: string): Promise<void> {
  if (!isNative() || topicFor(region, from) === topicFor(region, to)) return;
  try {
    await Fcm.unsubscribeFromTopic({ topic: topicFor(region, from) });
    await Fcm.subscribeToTopic({ topic: topicFor(region, to) });
  } catch {
    /* next start retries through the setting */
  }
}

/**
 * While the app is open, Android does not show the alert itself: SabiTori shows it, with the same rules as alerts
 * published by update (short, no link, no phone number, no code). Anything else is dropped.
 */
export function acceptForeground(n: { title?: string; body?: string }): { title: string; body: string } | null {
  return isSafeAlertText(n.title, 60) && isSafeAlertText(n.body, 240) ? { title: n.title, body: n.body } : null;
}

let listening: PluginListenerHandle | null = null;
export async function listenForeground(): Promise<void> {
  if (!isNative() || listening) return;
  try {
    listening = await Fcm.addListener('notificationReceived', ({ notification }) => {
      const ok = acceptForeground(notification);
      if (!ok) return;
      void (async () => {
        if (nativePlatform() === 'android') await LocalNotifications.createChannel({ id: ALERT_CHANNEL, name: 'Scam alerts', importance: 4, visibility: 1 });
        await LocalNotifications.schedule({ notifications: [{ id: 2_100_000_201, title: ok.title, body: ok.body, channelId: ALERT_CHANNEL, extra: { route: '/scams' } }] });
      })().catch(() => undefined);
    });
  } catch {
    /* plugin missing in this build */
  }
}
