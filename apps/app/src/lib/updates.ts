import {
  createIdbStore, createOverlayClipResolver, createOverlayFetch, createUpdateClient, quarantineActive, verifyActiveUpdates,
  type UpdateFailure, type UpdateResult, type UpdateStore,
} from '@sabitori/connect';
import { config } from '../config';
import { loadSettings } from './settings';

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
let clips: ReturnType<typeof createOverlayClipResolver> | null = null;
export function connectedAssets(): { fetch: (url: string) => Promise<Response>; resolveClip: (url: string) => Promise<string | null> } | null {
  if (!config.updates) return null;
  const s = updateStore();
  const f = createOverlayFetch(s, (u, i) => fetch(u, i));
  clips ??= createOverlayClipResolver(s);
  return { fetch: (u) => f(u), resolveClip: clips };
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

/**
 * Languages whose files this phone downloads (on a channel with per-language lists): the chosen one and the
 * two the app always falls back to. A language chosen later is fetched at the next check.
 */
let chain: string[] | null = null;
/** Set by the app once the packs are known: the chosen language and its whole fallback chain. */
export function setUpdateLanguages(tags: string[]): void {
  chain = tags.length ? [...new Set(tags)] : null;
}
export function updateTags(lang: string = loadSettings().lang): string[] {
  return chain ?? [...new Set([lang, 'fr', 'en'])];
}

let running: { done: Promise<UpdateResult>; abort: AbortController } | null = null;

/** Runs one check now (used by "Check now", by switching the feature on, and by the daily background check). */
export function runUpdateCheck(now: () => number = Date.now): Promise<UpdateResult> {
  const u = config.updates;
  if (!u) return Promise.resolve({ status: 'failed', sequence: 0, changed: [], error: 'not configured' });
  if (running) return running.done;
  const abort = new AbortController();
  const done = createUpdateClient({ baseUrl: u.url, publicKeyBase64: u.publicKey, store: updateStore(), now, tags: updateTags })
    .check({ signal: abort.signal })
    .then((r) => {
      if (!abort.signal.aborted) saveMemo({ lastCheckAt: new Date(now()).toISOString(), lastStatus: r.status, lastReason: r.reason ?? null });
      // New scam alerts came with this update: show them now, not at the next start.
      if (r.changed.some((p) => /^regions\/[A-Z]{2}\/alerts\.json$/.test(p))) {
        const s = loadSettings();
        void import('./alerts').then((m) => m.notifyNewAlerts(s.region, s.lang, new Date(now()).toISOString().slice(0, 10))).catch(() => undefined);
      }
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

const QUARANTINE = 'sabitori.updates.quarantine.v1';

export interface QuarantineMemo {
  at: string;
  /** Why the downloaded files were set aside (an error message, never message text). */
  reason: string;
}

export function loadQuarantine(): QuarantineMemo | null {
  try {
    const o = JSON.parse(localStorage.getItem(QUARANTINE) ?? 'null') as Partial<QuarantineMemo> | null;
    return o && typeof o.at === 'string' && typeof o.reason === 'string' ? { at: o.at, reason: o.reason } : null;
  } catch {
    return null;
  }
}

export function forgetQuarantine(): void {
  try {
    localStorage.removeItem(QUARANTINE);
  } catch {
    /* nothing to forget */
  }
}

/**
 * The downloaded files stopped the app from starting: set them aside so the next start (and this one,
 * after a retry with the built-in files) uses what the app came with, and remember why. Uses the connect
 * package's own quarantine when it has one (it keeps the files for inspection and refuses to re-install
 * the same sequence), otherwise forgets every downloaded file.
 */
export async function quarantineUpdates(reason: string, now: () => number = Date.now): Promise<void> {
  try {
    localStorage.setItem(QUARANTINE, JSON.stringify({ at: new Date(now()).toISOString(), reason: reason.slice(0, 200) }));
  } catch {
    /* kept for this session only */
  }
  // Keeps the files but serves none of them, and keeps the sequence so the same update is not installed again.
  await quarantineActive(updateStore(), reason.slice(0, 200));
  clips?.reset(); // clip URLs it already handed out must not be served from the set-aside files

}

const VERIFIED = 'sabitori.updates.verified.v1';

/**
 * Once per installed update, in the background: re-check every downloaded file with the connect package's
 * content checks. A file that the app could start with but that is broken (a pack with bad phrases, say)
 * is set aside the same way, from the next start on. Never throws.
 */
export async function verifyDownloadedOnce(): Promise<void> {
  if (!config.updates) return;
  try {
    const st = await updateStore().getState();
    if (!st || st.quarantined) return;
    let done: string | null = null;
    try {
      done = localStorage.getItem(VERIFIED);
    } catch {
      /* unknown: check again */
    }
    if (done === String(st.sequence)) return; // reading every file (voices are tens of MB) once per update is enough
    const r = await verifyActiveUpdates(updateStore());
    if (r.sequence === 0 || r.quarantined) return;
    if (!r.ok) await quarantineUpdates(`${r.problems[0]?.path ?? ''}: ${r.problems[0]?.message ?? 'damaged'}`);
    else localStorage.setItem(VERIFIED, String(r.sequence));
  } catch {
    /* try again at the next start */
  }
}
