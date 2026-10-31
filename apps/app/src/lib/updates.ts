import { createIdbStore, createOverlayClipResolver, createOverlayFetch, createUpdateClient, type UpdateFailure, type UpdateResult, type UpdateStore } from '@sabitori/connect';
import { config } from '../config';

/**
 * Optional updates. Nothing here runs unless VITE_UPDATE_URL and VITE_UPDATE_PUBLIC_KEY are set.
 * The app only ever sends GET requests for files named in a signed index; no message text,
 * no identifiers, no cookies.
 */
const MEM = 'sabitori.updates.v1';
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpdateMemo {
  /** ISO time of the last check that reached the update server (or failed after trying). */
  lastCheckAt: string | null;
  lastStatus: 'up_to_date' | 'updated' | 'failed' | null;
  lastReason: UpdateFailure | null;
}

export function loadMemo(): UpdateMemo {
  try {
    const o = JSON.parse(localStorage.getItem(MEM) ?? '{}') as Partial<UpdateMemo>;
    return {
      lastCheckAt: typeof o.lastCheckAt === 'string' ? o.lastCheckAt : null,
      lastStatus: o.lastStatus === 'up_to_date' || o.lastStatus === 'updated' || o.lastStatus === 'failed' ? o.lastStatus : null,
      lastReason: typeof o.lastReason === 'string' ? (o.lastReason as UpdateFailure) : null,
    };
  } catch {
    return { lastCheckAt: null, lastStatus: null, lastReason: null };
  }
}

function saveMemo(m: UpdateMemo): void {
  try {
    localStorage.setItem(MEM, JSON.stringify(m));
  } catch {
    /* kept for this session only */
  }
}

let store: UpdateStore | null = null;
export function updateStore(): UpdateStore {
  return (store ??= createIdbStore());
}

/** Fetch and clip resolver for the engine, or null when updates are not configured. */
export function connectedAssets(): { fetch: (url: string) => Promise<Response>; resolveClip: (url: string) => Promise<string | null> } | null {
  if (!config.updates) return null;
  const s = updateStore();
  const f = createOverlayFetch(s, (u, i) => fetch(u, i));
  return { fetch: (u) => f(u), resolveClip: createOverlayClipResolver(s) };
}

interface NetInfo {
  type?: string;
}
/** Wi-Fi only, when the browser can tell. Unknown means allowed. */
export function networkAllowsUpdate(nav: { connection?: NetInfo } = navigator as unknown as { connection?: NetInfo }): boolean {
  return nav.connection?.type !== 'cellular';
}

export function isCheckDue(memo: UpdateMemo, now: number): boolean {
  if (!memo.lastCheckAt) return true;
  const t = Date.parse(memo.lastCheckAt);
  return Number.isNaN(t) || now - t >= DAY_MS || t > now;
}

let running: { done: Promise<UpdateResult>; abort: AbortController } | null = null;

/** Runs one check now (used by "Check now", by switching the feature on, and by the daily background check). */
export function runUpdateCheck(now: () => number = Date.now): Promise<UpdateResult> {
  const u = config.updates;
  if (!u) return Promise.resolve({ status: 'failed', sequence: 0, changed: [], error: 'not configured' });
  if (running) return running.done;
  const abort = new AbortController();
  const done = createUpdateClient({ baseUrl: u.url, publicKeyBase64: u.publicKey, store: updateStore(), now })
    .check({ signal: abort.signal })
    .then((r) => {
      if (!abort.signal.aborted) saveMemo({ lastCheckAt: new Date(now()).toISOString(), lastStatus: r.status, lastReason: r.reason ?? null });
      return r;
    })
    .finally(() => {
      if (running?.abort === abort) running = null;
    });
  running = { done, abort };
  return done;
}

export const updateCheckRunning = (): boolean => running !== null;

/** Once a day at most, on start-up, in the background; never throws, never blocks. */
export function maybeBackgroundCheck(opts: { enabled: boolean; now?: () => number; delayMs?: number }): void {
  if (!config.updates || !opts.enabled) return;
  const now = opts.now ?? Date.now;
  if (!isCheckDue(loadMemo(), now()) || !networkAllowsUpdate()) return;
  const start = () => void runUpdateCheck(now).catch(() => undefined);
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  window.setTimeout(() => (idle ? idle(start, { timeout: 10_000 }) : start()), opts.delayMs ?? 5000);
}

/**
 * Forget every downloaded file: the app is back to its built-in languages and warnings the next
 * time it starts. A check that is still running is cancelled first, so it cannot re-install
 * what was just deleted. The memo is cleared too, so the next start checks again if the feature is on.
 */
export async function clearUpdates(): Promise<void> {
  const r = running;
  if (r) {
    r.abort.abort();
    await r.done.catch(() => undefined);
  }
  await updateStore().clear();
  try {
    localStorage.removeItem(MEM);
  } catch {
    /* nothing to forget */
  }
}
