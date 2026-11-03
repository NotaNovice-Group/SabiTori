import { contentTypeOf, updatePathOfUrl } from './paths.js';
import type { FetchFn, UpdateStore } from './types.js';

/**
 * A fetch-like function: a path that is in the active update set is served from it, everything
 * else goes to the bundled app assets. Unknown shapes of URL always go to the bundled fetch.
 * Reading the store never throws into the app: any store error means "use the bundled file".
 */
export function createOverlayFetch(store: UpdateStore, bundledFetch: FetchFn): FetchFn {
  return async (url, init) => {
    const path = updatePathOfUrl(url);
    if (path) {
      try {
        const bytes = await store.getFile(path);
        if (bytes) {
          return new Response(bytes.slice().buffer, { status: 200, headers: { 'content-type': contentTypeOf(path) } });
        }
      } catch {
        /* fall through to the bundled file */
      }
    }
    return bundledFetch(url, init);
  };
}

/**
 * For audio clips, which the player gives to <audio src>. Returns a blob: URL for a clip that is in
 * the active update set, else null (play the bundled URL). Blob URLs are kept for the session.
 */
export function createOverlayClipResolver(store: UpdateStore): ((url: string) => Promise<string | null>) & { reset(): void } {
  const urls = new Map<string, string>();
  const resolve = async (url: string): Promise<string | null> => {
    const path = updatePathOfUrl(url);
    if (!path || typeof URL.createObjectURL !== 'function') return null;
    const hit = urls.get(path);
    if (hit) return hit;
    try {
      const bytes = await store.getFile(path);
      if (!bytes) return null;
      const blobUrl = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: contentTypeOf(path) }));
      urls.set(path, blobUrl);
      return blobUrl;
    } catch {
      return null;
    }
  };
  /** Forget (and release) the blob URLs: call after quarantineActive or clearUpdates so clips are read from the bundled files again. */
  resolve.reset = (): void => {
    for (const u of urls.values()) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* nothing to release */
      }
    }
    urls.clear();
  };
  return resolve;
}
