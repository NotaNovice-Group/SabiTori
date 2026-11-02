/**
 * Asks the browser to keep this site's storage (IndexedDB holds the project and its clips). Without it a phone
 * that runs short of space may clear the recordings. Never throws; resolves null when the browser cannot say.
 */
export async function requestPersistence(storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage): Promise<boolean | null> {
  try {
    if (!storage) return null;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    if (typeof storage.persist !== 'function') return null;
    return await storage.persist();
  } catch {
    return null;
  }
}
