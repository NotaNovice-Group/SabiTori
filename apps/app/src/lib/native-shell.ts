import { SplashScreen } from '@capacitor/splash-screen';
import { isNative, forgetSharedFiles, fileFromNativePath } from './native';
import { listenShares } from './share';
import { listenReminderTaps } from './reminders';
import { session } from './session';
import { navigate } from './router';

/**
 * Android-only wiring, started once when the app opens: share-sheet intake and taps on reminders.
 * Does nothing in a browser.
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
