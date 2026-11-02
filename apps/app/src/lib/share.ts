import { addShareListener } from './share-plugin';

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

export interface ShareDeps {
  setPhoto(f: File | null): void;
  setSharedText(t: string | null): void;
  navigate(path: string): void;
  loadImage(f: SharedFile): Promise<File>;
  /** Called once the shared bytes are in memory, so the private cache copy can go. */
  done?(): void;
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

export type ShareOutcome = 'photo' | 'text' | 'ignored';

/**
 * An image goes to the capture flow (sharpness check, then reading); text goes to the paste
 * flow, prefilled. The `?s=` stamp makes a second share while the screen is open start afresh.
 */
export async function routeShare(ev: ShareEvent, deps: ShareDeps): Promise<ShareOutcome> {
  const stamp = (deps.stamp ?? Date.now)();
  const image = (ev.files ?? []).find(isImage);
  if (image) {
    try {
      const file = await deps.loadImage(image);
      deps.setPhoto(file);
      deps.navigate(`/capture?s=${stamp}`);
      return 'photo';
    } catch {
      /* fall through to text, if there is any */
    } finally {
      deps.done?.();
    }
  }
  const text = sharedTextOf(ev);
  if (text) {
    deps.setSharedText(text);
    deps.navigate(`/paste?s=${stamp}`);
    return 'text';
  }
  return 'ignored';
}

/** Registers the share listener. The plugin keeps a cold-start share until this runs. */
export async function listenShares(deps: ShareDeps): Promise<() => void> {
  return addShareListener((ev) => void routeShare(ev, deps));
}
