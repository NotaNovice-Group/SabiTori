import { Capacitor, registerPlugin } from '@capacitor/core';

/** True inside the Android app (Capacitor shell). In a browser every feature keeps its web path. */
export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Small project-owned Android plugin (MainActivity side): system settings and private-cache clean-up. */
interface SabiToriNativePlugin {
  openSettings(opts: { target: 'app' | 'notifications' }): Promise<void>;
  /** Deletes the copies of shared files that the share plugin keeps in the app's private cache. */
  forgetSharedFiles(): Promise<void>;
}

const Native = registerPlugin<SabiToriNativePlugin>('SabiToriNative');

export async function openSystemSettings(target: 'app' | 'notifications' = 'app'): Promise<void> {
  if (!isNative()) return;
  try {
    await Native.openSettings({ target });
  } catch {
    /* nothing more can be done */
  }
}

export async function forgetSharedFiles(): Promise<void> {
  if (!isNative()) return;
  try {
    await Native.forgetSharedFiles();
  } catch {
    /* the system empties the cache by itself */
  }
}

/** Reads a file the native layer exposes through the app's own origin into a File. Nothing leaves the phone. */
export async function fileFromNativePath(path: string, name: string, type: string): Promise<File> {
  const res = await fetch(Capacitor.convertFileSrc(path));
  if (!res.ok) throw new Error(`could not read ${name}`);
  const blob = await res.blob();
  return new File([blob], name, { type: type || blob.type || 'image/jpeg' });
}
