import { SplashScreen } from '@capacitor/splash-screen';
import { isNative, forgetSharedFiles, fileFromNativePath, takeShareNotes } from './native';
import { listenShares } from './share';
import { listenReminderTaps } from './reminders';
import { session } from './session';
import { navigate } from './router';

/**
 * Native wiring, started once when the app opens: share-sheet intake and taps on reminders.
 * Does nothing in a browser. On iOS the share listener is registered but never fires (no Share Extension yet,
 * see docs/ios.md); reminder taps work the same as on Android.
 */
export function startNativeShell(): () => void {
  if (!isNative()) return () => undefined;
  let stopped = false;
  const offs: Array<() => void> = [];
  const keep = (p: Promise<() => void>) =>
    void p.then((off) => (stopped ? off() : offs.push(off))).catch(() => undefined);
  keep(
    listenShares({
      setPhoto: (f) => session.setPhoto(f),
      setSharedText: (t) => session.setSharedText(t),
      setNotice: (k) => session.setNotice(k),
      notes: () => takeShareNotes(),
      navigate: (p) => navigate(p),
      loadImage: (f) => fileFromNativePath(f.uri, f.name, f.mimeType),
      done: () => void forgetSharedFiles(),
    }),
  );
  keep(listenReminderTaps((route) => navigate(route)));
  return () => {
    stopped = true;
    offs.forEach((o) => o());
  };
}

/** The first screen is ready: let the native splash go. */
export function hideSplash(): void {
  if (!isNative()) return;
  void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined);
}
