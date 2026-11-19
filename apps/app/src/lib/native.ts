import { Capacitor, registerPlugin } from '@capacitor/core';

/** True inside the Android or iOS app (Capacitor shell). In a browser every feature keeps its web path. */
export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export type NativePlatform = 'android' | 'ios' | 'web';

/** Which shell the page runs in. Anything unknown counts as the web. */
export const nativePlatform = (): NativePlatform => {
  try {
    const p = Capacitor.getPlatform();
    return p === 'android' || p === 'ios' ? p : 'web';
  } catch {
    return 'web';
  }
};

/** The SabiToriNative plugin exists only in the Android project (no Swift port yet, see docs/ios.md). */
const hasNativeHelper = (): boolean => nativePlatform() === 'android';

/** Small project-owned Android plugin (MainActivity side): system settings and private-cache clean-up. */
interface SabiToriNativePlugin {
  openSettings(opts: { target: 'app' | 'notifications' }): Promise<void>;
  /** Deletes the copies of shared files that the share plugin keeps in the app's private cache. */
  forgetSharedFiles(): Promise<void>;
  /** What the activity left out of the last share (too big, not a picture), then forgets it. */
  takeShareNotes(): Promise<{ tooBig?: number; notImage?: number; more?: number }>;
  /** Waits (up to five minutes) for the next incoming SMS and asks the person, in Android's own sheet, to allow it. */
  waitForSms(): Promise<{ text?: string; reason?: string }>;
  cancelSms(): Promise<void>;
}

const Native = registerPlugin<SabiToriNativePlugin>('SabiToriNative');

/** iOS opens this app's page in the Settings app for this URL (UIApplication.openSettingsURLString). */
export const IOS_SETTINGS_URL = 'app-settings:';

export async function openSystemSettings(target: 'app' | 'notifications' = 'app', open: (url: string) => unknown = (u) => window.open(u, '_blank')): Promise<void> {
  const platform = nativePlatform();
  if (platform === 'ios') {
    // No Swift plugin: Capacitor's iOS web view hands a URL it does not serve to the system, which opens
    // SabiTori's page in Settings (camera, photos and notifications are all switched there).
    try {
      open(IOS_SETTINGS_URL);
    } catch {
      /* nothing more can be done */
    }
    return;
  }
  if (!hasNativeHelper()) return;
  try {
    await Native.openSettings({ target });
  } catch {
    /* nothing more can be done */
  }
}

export async function forgetSharedFiles(): Promise<void> {
  if (!hasNativeHelper()) return;
  try {
    await Native.forgetSharedFiles();
  } catch {
    /* the system empties the cache by itself */
  }
}

export async function takeShareNotes(): Promise<{ tooBig: number; notImage: number; more: number }> {
  const none = { tooBig: 0, notImage: 0, more: 0 };
  if (!hasNativeHelper()) return none;
  try {
    const r = await Native.takeShareNotes();
    return { tooBig: Number(r?.tooBig) || 0, notImage: Number(r?.notImage) || 0, more: Number(r?.more) || 0 };
  } catch {
    return none;
  }
}

/** Reads a file the native layer exposes through the app's own origin into a File. Nothing leaves the phone. */
export async function fileFromNativePath(path: string, name: string, type: string): Promise<File> {
  const res = await fetch(Capacitor.convertFileSrc(path));
  if (!res.ok) throw new Error(`could not read ${name}`);
  const blob = await res.blob();
  return new File([blob], name, { type: type || blob.type || 'image/jpeg' });
}

/** What waiting for one SMS ended with. Only `text` carries a message; it never leaves the phone. */
export type SmsWait = { status: 'text'; text: string } | { status: 'timeout' | 'denied' | 'unavailable' | 'cancelled' };

/** The one-SMS reader exists only in the Android app (Google Play services' SMS User Consent sheet). */
export const canWaitForSms = (): boolean => hasNativeHelper();

/**
 * Asks Android for the next incoming SMS. No SMS permission and no inbox access: Play services shows the person
 * that one message and hands it over only if they press Allow.
 */
export async function waitForSms(): Promise<SmsWait> {
  if (!hasNativeHelper()) return { status: 'unavailable' };
  try {
    const r = await Native.waitForSms();
    if (typeof r?.text === 'string' && r.text.trim()) return { status: 'text', text: r.text };
    const reason = r?.reason;
    if (reason === 'timeout' || reason === 'denied') return { status: reason };
    if (reason === 'cancelled' || reason === 'replaced') return { status: 'cancelled' };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function cancelSmsWait(): Promise<void> {
  if (!hasNativeHelper()) return;
  try {
    await Native.cancelSms();
  } catch {
    /* nothing was waiting */
  }
}
