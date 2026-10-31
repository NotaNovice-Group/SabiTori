import type { Card } from '@sabitori/core';
import { expiredIds } from './retention';

/** History in IndexedDB. Small wrapper, no dependency. Every call degrades to a no-op. */
const DB = 'sabitori';
const STORE = 'cards';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export async function listCards(): Promise<Card[]> {
  try {
    const all = await run('readonly', (s) => s.getAll() as IDBRequest<Card[]>);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function getCard(id: string): Promise<Card | undefined> {
  try {
    return await run('readonly', (s) => s.get(id) as IDBRequest<Card | undefined>);
  } catch {
    return undefined;
  }
}

export async function putCard(card: Card): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(card));
  } catch {
    /* storage unavailable: the card still shows this session */
  }
}

export async function deleteCard(id: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

export async function clearCards(): Promise<void> {
  try {
    await run('readwrite', (s) => s.clear());
  } catch {
    /* ignore */
  }
}

/** Delete what the retention setting says is too old. Returns the remaining cards. */
export async function applyRetention(days: number): Promise<Card[]> {
  const all = await listCards();
  const old = expiredIds(all, days);
  await Promise.all(old.map(deleteCard));
  return all.filter((c) => !old.includes(c.id));
}
