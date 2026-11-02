import type { Card, IsoDate } from '@sabitori/core';
import { expiredIds, isCardRecord } from './retention';
import { cancelReminders } from './reminders';

/** History in IndexedDB. Small wrapper, no dependency. Every call degrades to a no-op. */
const DB = 'sabitori';
const STORE = 'cards';

/** A card as kept in history. `keepUntil` (the deadline) is set while a reminder is pending. */
export type StoredCard = Card & { keepUntil?: IsoDate };

/** Cancels the reminders of a card that is deleted (replaceable in tests). */
export type CancelFn = (cardId: string) => Promise<void>;

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

async function rawList(): Promise<unknown[]> {
  try {
    return await run('readonly', (s) => s.getAll() as IDBRequest<unknown[]>);
  } catch {
    return [];
  }
}

const byNewest = (a: StoredCard, b: StoredCard) => (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0);

/** Cards in history, newest first. Records that are not cards (a bug, an old format) are left out. */
export async function listCards(): Promise<StoredCard[]> {
  return ((await rawList()).filter(isCardRecord) as StoredCard[]).sort(byNewest);
}

export async function getCard(id: string): Promise<StoredCard | undefined> {
  try {
    const c = await run('readonly', (s) => s.get(id) as IDBRequest<unknown>);
    return isCardRecord(c) ? (c as StoredCard) : undefined;
  } catch {
    return undefined;
  }
}

/** True when the card is in history. Never throws. */
export async function putCard(card: StoredCard): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(card));
    return true;
  } catch {
    /* storage unavailable: the card still shows this session */
    return false;
  }
}

export async function deleteCard(id: string, cancel: CancelFn = cancelReminders): Promise<void> {
  await cancel(id).catch(() => undefined);
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

/** Delete every card, and every reminder of those cards. */
export async function clearCards(cancel: CancelFn = cancelReminders): Promise<void> {
  const ids = (await rawList()).map((r) => (r as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string');
  await Promise.all(ids.map((id) => cancel(id).catch(() => undefined)));
  try {
    await run('readwrite', (s) => s.clear());
  } catch {
    /* ignore */
  }
}

/**
 * Delete what the retention setting says is too old, and any record that is not a valid card or is dated
 * in the future (they would break the history list). Their reminders go too. Returns the remaining cards.
 */
export async function applyRetention(days: number, now = Date.now(), cancel: CancelFn = cancelReminders): Promise<StoredCard[]> {
  const raw = await rawList();
  const bad = raw.filter((r) => !isCardRecord(r)).map((r) => (r as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string');
  const cards = raw.filter(isCardRecord) as StoredCard[];
  const old = new Set([...expiredIds(cards, days, now), ...bad]);
  await Promise.all([...old].map((id) => deleteCard(id, cancel)));
  return cards.filter((c) => !old.has(c.id)).sort(byNewest);
}
