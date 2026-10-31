/** IndexedDB: projects and clips, so work survives reloads and works offline. */
import type { ClipRecord, Project } from './model';

const DB = 'sabitori-recorder';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('clips');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run<T>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const r = f(tx.objectStore(store));
    tx.oncomplete = () => resolve((r ? r.result : undefined) as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  listProjects: () => run<Project[]>('projects', 'readonly', (s) => s.getAll()),
  getProject: (id: string) => run<Project | undefined>('projects', 'readonly', (s) => s.get(id)),
  putProject: (p: Project) => run('projects', 'readwrite', (s) => s.put(p)),
  async deleteProject(id: string) {
    await run('projects', 'readwrite', (s) => s.delete(id));
    await run('clips', 'readwrite', (s) => s.delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`)));
  },
  async listClips(pid: string): Promise<ClipRecord[]> {
    return run<ClipRecord[]>('clips', 'readonly', (s) => s.getAll(IDBKeyRange.bound(`${pid}:`, `${pid}:￿`)));
  },
  putClip: (pid: string, c: ClipRecord) => run('clips', 'readwrite', (s) => s.put(c, `${pid}:${c.id}`)),
  deleteClip: (pid: string, id: string) => run('clips', 'readwrite', (s) => s.delete(`${pid}:${id}`)),
};
