import { addShareListener } from './share-plugin';
import { capText } from './session';
import type { ExtraKey } from '../engine/extra';

export interface SharedFile {
  uri: string;
  name: string;
  mimeType: string;
}
export interface ShareEvent {
  title?: string;
  texts?: string[];
  files?: SharedFile[];
}

/** What the Android side left out of a share before it reached the page (see SabiToriNativePlugin.java). */
export interface ShareNotes {
  /** Files over the size limit, not copied. */
  tooBig: number;
  /** Files that are not pictures, not copied. */
  notImage: number;
  /** Further pictures after the first, not copied (only the first is read). */
  more?: number;
}

export interface ShareDeps {
  setPhoto(f: File | null): void;
  setSharedText(t: string | null): void;
  /** A quiet message the next screen shows (and can speak). */
  setNotice?(k: ExtraKey | null): void;
  navigate(path: string): void;
  loadImage(f: SharedFile): Promise<File>;
  /** Called once the share has been handled, on every path, so the private cache copies can go. */
  done?(): void;
  /** Files the native layer refused before the share reached the page. */
  notes?(): Promise<ShareNotes>;
  stamp?(): number;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i;
export const isImage = (f: SharedFile) => f.mimeType.toLowerCase().startsWith('image/') || (!f.mimeType.startsWith('text/') && IMAGE_EXT.test(f.name));

/** The shared text: subject (when it adds something) and body, nothing else. */
export function sharedTextOf(ev: ShareEvent): string {
  const all = [ev.title, ...(ev.texts ?? [])].map((p) => (p ?? '').trim()).filter(Boolean);
  const parts = all.filter((s, i) => !all.some((q, j) => j !== i && q.includes(s) && (q.length > s.length || j < i)));
  return parts.join('\n').trim();
}

export type ShareOutcome = 'photo' | 'text' | 'unsupported' | 'ignored';

/**
 * An image goes to the capture flow (sharpness check, then reading); text goes to the paste
 * flow, prefilled. The `?s=` stamp makes a second share while the screen is open start afresh.
 * Only the first picture is read (the next screen says so); a share of files that are not
 * pictures, with no text, opens the home screen with a plain message. Every path ends by
 * calling `done()`, so no copy of a shared file stays in the app's cache.
 */
export async function routeShare(ev: ShareEvent, deps: ShareDeps): Promise<ShareOutcome> {
  const stamp = (deps.stamp ?? Date.now)();
  const notice = (k: ExtraKey | null) => deps.setNotice?.(k);
  try {
    const files = ev.files ?? [];
    const notes = (await deps.notes?.().catch(() => null)) ?? { tooBig: 0, notImage: 0 };
    const images = files.filter(isImage);
    const image = images[0];
    if (image) {
      try {
        const file = await deps.loadImage(image);
        deps.setPhoto(file);
        notice(images.length > 1 || (notes.more ?? 0) > 0 ? 'app.share.first_only' : null);
        deps.navigate(`/capture?s=${stamp}`);
        return 'photo';
      } catch {
        /* fall through to text, if there is any */
      }
    }
    const raw = sharedTextOf(ev);
    if (raw) {
      const { text, cut } = capText(raw);
      deps.setSharedText(text);
      notice(cut ? 'app.share.too_long' : null);
      deps.navigate(`/paste?s=${stamp}`);
      return 'text';
    }
    if (files.length > 0 || notes.tooBig > 0 || notes.notImage > 0) {
      // Nothing we can read: say so instead of doing nothing.
      notice(notes.tooBig > 0 && images.length === 0 ? 'app.share.too_big' : 'app.share.unsupported');
      deps.navigate(`/?s=${stamp}`);
      return 'unsupported';
    }
    return 'ignored';
  } finally {
    deps.done?.();
  }
}

/** Registers the share listener. The plugin keeps a cold-start share until this runs. */
export async function listenShares(deps: ShareDeps): Promise<() => void> {
  return addShareListener((ev) => void routeShare(ev, deps));
}
