import type { InstalledState, UpdateStore } from './types.js';

const DB = 'sabitori-updates';
const META = 'meta';
const ACTIVE = 'active';
const STAGING = 'staging';

const done = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error('IndexedDB error'));
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error('IndexedDB error'));
    tx.onabort = () => rej(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

/** IndexedDB store (browser, Android WebView). Opens the database on first use, never at import. */
export function createIdbStore(factory?: IDBFactory): UpdateStore {
  let dbP: Promise<IDBDatabase> | null = null;
  const db = () =>
    (dbP ??= new Promise<IDBDatabase>((res, rej) => {
      const idb = factory ?? globalThis.indexedDB;
      if (!idb) return rej(new Error('IndexedDB is not available'));
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => {
        for (const n of [META, ACTIVE, STAGING]) req.result.createObjectStore(n);
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error ?? new Error('IndexedDB error'));
    }).catch((e) => {
      dbP = null;
      throw e;
    }));

  async function read(area: string, key: string): Promise<Uint8Array | null> {
    const d = await db();
    const v = (await done(d.transaction(area, 'readonly').objectStore(area).get(key))) as ArrayBuffer | Uint8Array | undefined;
    if (!v) return null;
    return v instanceof Uint8Array ? v : new Uint8Array(v);
  }

  async function quarantined(): Promise<boolean> {
    const d = await db();
    const v = (await done(d.transaction(META, 'readonly').objectStore(META).get('state'))) as InstalledState | undefined;
    return !!v?.quarantined;
  }

  return {
    async getState() {
      const d = await db();
      const v = await done(d.transaction(META, 'readonly').objectStore(META).get('state'));
      return (v as InstalledState | undefined) ?? null;
    },
    async getFile(path) {
      return (await quarantined()) ? null : read(ACTIVE, path);
    },
    async quarantine(reason) {
      const d = await db();
      const tx = d.transaction(META, 'readwrite');
      const meta = tx.objectStore(META);
      const prev = (await done(meta.get('state'))) as InstalledState | undefined;
      if (prev) meta.put({ ...prev, quarantined: { at: new Date().toISOString(), reason } }, 'state');
      await finished(tx);
    },
    async hasFile(path) {
      if (await quarantined()) return false;
      const d = await db();
      const n = await done(d.transaction(ACTIVE, 'readonly').objectStore(ACTIVE).count(path));
      return n > 0;
    },
    getStaged: (path) => read(STAGING, path),
    async stage(path, bytes) {
      const d = await db();
      const tx = d.transaction(STAGING, 'readwrite');
      tx.objectStore(STAGING).put(bytes.slice().buffer, path);
      await finished(tx);
    },
    async discardStaging() {
      const d = await db();
      const tx = d.transaction(STAGING, 'readwrite');
      tx.objectStore(STAGING).clear();
      await finished(tx);
    },
    async commit(next) {
      const d = await db();
      const tx = d.transaction([META, ACTIVE, STAGING], 'readwrite');
      const meta = tx.objectStore(META);
      const active = tx.objectStore(ACTIVE);
      const staging = tx.objectStore(STAGING);
      const prev = (await done(meta.get('state'))) as InstalledState | undefined;
      const stagedKeys = new Set((await done(staging.getAllKeys())) as string[]);
      const activeKeys = new Set((await done(active.getAllKeys())) as string[]);
      for (const [path, m] of Object.entries(next.files)) {
        const keep = prev?.files[path]?.sha256 === m.sha256 && activeKeys.has(path);
        if (!stagedKeys.has(path) && !keep) {
          tx.abort();
          await finished(tx).catch(() => undefined);
          throw new Error(`commit: ${path} is not staged`);
        }
      }
      for (const k of activeKeys) if (!(k in next.files)) active.delete(k);
      for (const k of stagedKeys) {
        if (k in next.files) active.put(await done(staging.get(k)), k);
      }
      staging.clear();
      meta.put(next, 'state');
      await finished(tx);
    },
    async clear() {
      const d = await db();
      const tx = d.transaction([META, ACTIVE, STAGING], 'readwrite');
      for (const n of [META, ACTIVE, STAGING]) tx.objectStore(n).clear();
      await finished(tx);
    },
  };
}
