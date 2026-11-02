import { validateUpdateFile } from './content.js';
import type { UpdateStore } from './types.js';

export interface ActiveCheck {
  ok: boolean;
  /** Installed sequence (0 when nothing is installed). */
  sequence: number;
  quarantined: boolean;
  problems: { path: string; message: string }[];
}

/**
 * Re-checks every file of the active update set with the same validators the client applies before installing
 * (a store can be damaged, or hold files from before content checks existed). Never throws.
 */
export async function verifyActiveUpdates(store: UpdateStore): Promise<ActiveCheck> {
  const problems: ActiveCheck['problems'] = [];
  try {
    const st = await store.getState();
    if (!st) return { ok: true, sequence: 0, quarantined: false, problems };
    if (st.quarantined) return { ok: true, sequence: st.sequence, quarantined: true, problems };
    for (const path of Object.keys(st.files)) {
      try {
        const bytes = await store.getFile(path);
        if (!bytes) problems.push({ path, message: 'is listed as installed but is missing' });
        else validateUpdateFile(path, bytes);
      } catch (e) {
        problems.push({ path, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return { ok: problems.length === 0, sequence: st.sequence, quarantined: false, problems };
  } catch (e) {
    return { ok: false, sequence: 0, quarantined: false, problems: [{ path: '(store)', message: e instanceof Error ? e.message : String(e) }] };
  }
}

/**
 * Stops using the downloaded files: the store serves none of them, so the app reads its bundled packs. For
 * the app's startup fallback: when the app cannot start (or `verifyActiveUpdates` finds a problem) with the update
 * set active, call this and start again. The sequence is kept, so the same update is not installed again; the next
 * NEWER update replaces the set. A store without quarantine support is cleared instead. Never throws.
 */
export async function quarantineActive(store: UpdateStore, reason = 'the app could not use the downloaded files'): Promise<{ quarantined: boolean; sequence: number }> {
  try {
    const st = await store.getState();
    if (!st) return { quarantined: false, sequence: 0 };
    if (st.quarantined) return { quarantined: true, sequence: st.sequence };
    if (store.quarantine) await store.quarantine(reason);
    else await store.clear();
    return { quarantined: true, sequence: st.sequence };
  } catch {
    return { quarantined: false, sequence: 0 };
  }
}

/** Forgets every downloaded file and the sequence ("Delete downloaded updates"). */
export async function clearUpdates(store: UpdateStore): Promise<void> {
  await store.clear();
}
