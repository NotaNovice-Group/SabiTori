import { fromBase64, sha256Hex, verifySignature } from './crypto.js';
import { MAX_FILE_BYTES, MAX_FILES, MAX_INDEX_BYTES, MAX_TOTAL_BYTES, isAllowedPath } from './paths.js';
import type { FetchFn, InstalledState, UpdateFailure, UpdateIndex, UpdateResult, UpdateStore } from './types.js';

export interface UpdateClientOptions {
  /** Directory of the update channel, e.g. "https://example.org/sabitori". Must be https. */
  baseUrl: string;
  /** Base64 Ed25519 public key (32 bytes), pinned in the app build. */
  publicKeyBase64: string;
  store: UpdateStore;
  fetch?: FetchFn;
  now?: () => number;
  /**
   * A request that receives nothing for this long fails with 'network' instead of hanging the
   * check forever (the timer restarts with every chunk, so a slow but live download is fine).
   */
  idleTimeoutMs?: number;
}

export interface UpdateClient {
  check(opts?: { signal?: AbortSignal }): Promise<UpdateResult>;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

class Fail extends Error {
  constructor(readonly reason: UpdateFailure, message: string) {
    super(message);
  }
}

const SHA = /^[0-9a-f]{64}$/;

/** Validates the shape of a (signed) index. Throws Fail('bad_index'). */
export function parseIndex(bytes: Uint8Array): UpdateIndex {
  let j: unknown;
  try {
    j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Fail('bad_index', 'index.json is not valid JSON');
  }
  const o = j as Partial<UpdateIndex> | null;
  const bad = (m: string): never => {
    throw new Fail('bad_index', m);
  };
  if (!o || typeof o !== 'object') return bad('index is not an object');
  if (o.formatVersion !== 1) return bad('unsupported formatVersion');
  if (o.channel !== 'stable') return bad('unsupported channel');
  if (!Number.isSafeInteger(o.sequence) || (o.sequence as number) < 1) return bad('bad sequence');
  if (typeof o.issuedAt !== 'string' || Number.isNaN(Date.parse(o.issuedAt))) return bad('bad issuedAt');
  if (!Array.isArray(o.files) || o.files.length > MAX_FILES) return bad('bad files list');
  const seen = new Set<string>();
  let total = 0;
  for (const f of o.files) {
    if (!f || typeof f !== 'object') return bad('bad file entry');
    if (!isAllowedPath(f.path)) return bad(`path not allowed: ${String((f as { path?: unknown }).path).slice(0, 80)}`);
    if (seen.has(f.path)) return bad(`duplicate path ${f.path}`);
    seen.add(f.path);
    if (typeof f.sha256 !== 'string' || !SHA.test(f.sha256)) return bad(`bad sha256 for ${f.path}`);
    if (!Number.isSafeInteger(f.size) || f.size < 0) return bad(`bad size for ${f.path}`);
    if (f.size > MAX_FILE_BYTES) return bad(`${f.path} is larger than ${MAX_FILE_BYTES} bytes`);
    total += f.size;
  }
  if (total > MAX_TOTAL_BYTES) return bad('update is larger than the allowed total');
  return o as UpdateIndex;
}

/**
 * Reads a body of at most `limit` bytes. Stops reading (and cancels the stream) as soon as the
 * limit is passed, so a lying server cannot make the phone buffer a huge body first.
 */
async function readBody(res: Response, limit: number, onChunk: () => void): Promise<Uint8Array> {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > limit) throw new Fail('bad_file', 'larger than expected');
    return new Uint8Array(buf);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Fail('bad_file', 'larger than expected');
    }
    chunks.push(value);
    onChunk();
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export function createUpdateClient(opts: UpdateClientOptions): UpdateClient {
  const doFetch: FetchFn = opts.fetch ?? ((u, i) => fetch(u, i));
  const now = opts.now ?? Date.now;
  const idleMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const base = opts.baseUrl.replace(/\/+$/, '');
  const baseOrigin = originOf(base);

  // No cookies, no referrer, no cache, no identifiers: the request is just the file path.
  const get = async (path: string, limit: number, signal?: AbortSignal): Promise<Uint8Array> => {
    const ctrl = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, idleMs);
    };
    const onOuterAbort = () => ctrl.abort();
    if (signal?.aborted) throw new Fail('network', 'cancelled');
    signal?.addEventListener('abort', onOuterAbort, { once: true });
    arm();
    try {
      let res: Response;
      try {
        res = await doFetch(`${base}/${path}`, {
          method: 'GET',
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          redirect: 'follow',
          signal: ctrl.signal,
        });
      } catch (e) {
        if (timedOut) throw new Fail('network', `${path}: no answer for ${idleMs} ms`);
        throw new Fail('network', `could not fetch ${path}: ${(e as Error).message}`);
      }
      if (!res.ok) throw new Fail('network', `${path}: HTTP ${res.status}`);
      // A redirect to another origin is refused: files come from the configured host only.
      const finalOrigin = typeof res.url === 'string' && res.url ? originOf(res.url) : null;
      if (baseOrigin && finalOrigin && finalOrigin !== baseOrigin) {
        await res.body?.cancel().catch(() => undefined);
        throw new Fail('network', `${path}: redirected to another origin`);
      }
      const len = Number(res.headers?.get?.('content-length'));
      if (Number.isFinite(len) && len > limit) {
        await res.body?.cancel().catch(() => undefined);
        throw new Fail('bad_file', `${path} is larger than expected`);
      }
      try {
        return await readBody(res, limit, arm);
      } catch (e) {
        if (e instanceof Fail) throw new Fail(e.reason, `${path} ${e.message}`);
        if (timedOut) throw new Fail('network', `${path}: no answer for ${idleMs} ms`);
        throw new Fail('network', `download of ${path} was cut: ${(e as Error).message}`);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  };

  async function run(signal?: AbortSignal): Promise<UpdateResult> {
    const { store } = opts;
    if (!/^https:\/\//i.test(base)) throw new Fail('network', 'the update address is not https');
    let installed: InstalledState | null;
    try {
      installed = await store.getState();
    } catch (e) {
      throw new Fail('store', `could not read stored updates: ${(e as Error).message}`);
    }
    const have = installed?.sequence ?? 0;

    try {
      fromBase64(opts.publicKeyBase64);
    } catch {
      throw new Fail('bad_signature', 'the pinned public key is not valid base64');
    }
    const indexBytes = await get('index.json', MAX_INDEX_BYTES, signal);
    const sigBytes = await get('index.json.sig', 1024, signal);
    const sig = new TextDecoder().decode(sigBytes).trim();
    if (!verifySignature(sig, indexBytes, opts.publicKeyBase64)) {
      throw new Fail('bad_signature', 'the update signature is not valid');
    }
    const index = parseIndex(indexBytes);

    if (index.sequence < have) throw new Fail('rollback', `update ${index.sequence} is older than installed ${have}`);
    if (index.sequence === have) return { status: 'up_to_date', sequence: have, changed: [] };

    // A file is downloaded when its hash changed, or when the active set lost it (so a damaged
    // store heals instead of failing every commit from then on).
    const changed: typeof index.files = [];
    for (const f of index.files) {
      const same = installed?.files[f.path]?.sha256 === f.sha256;
      let present = false;
      if (same) {
        try {
          present = await store.hasFile(f.path);
        } catch (e) {
          throw new Fail('store', `could not read stored updates: ${(e as Error).message}`);
        }
      }
      if (!same || !present) changed.push(f);
    }
    const next: InstalledState = {
      sequence: index.sequence,
      updatedAt: new Date(now()).toISOString(),
      files: Object.fromEntries(index.files.map((f) => [f.path, { sha256: f.sha256, size: f.size }])),
    };

    try {
      await store.discardStaging();
      for (const f of changed) {
        if (signal?.aborted) throw new Fail('network', 'cancelled');
        const bytes = await get(f.path, f.size, signal);
        if (bytes.length !== f.size) throw new Fail('bad_file', `${f.path} has the wrong size`);
        if (sha256Hex(bytes) !== f.sha256) throw new Fail('bad_file', `${f.path} does not match its hash`);
        try {
          await store.stage(f.path, bytes);
        } catch (e) {
          throw new Fail('store', `could not save ${f.path}: ${(e as Error).message}`);
        }
      }
      if (signal?.aborted) throw new Fail('network', 'cancelled');
      try {
        await store.commit(next);
      } catch (e) {
        throw new Fail('store', `could not switch to the new files: ${(e as Error).message}`);
      }
    } catch (e) {
      await store.discardStaging().catch(() => undefined);
      throw e;
    }
    return { status: 'updated', sequence: index.sequence, changed: changed.map((f) => f.path) };
  }

  return {
    async check(o) {
      try {
        return await run(o?.signal);
      } catch (e) {
        const seq = await opts.store.getState().then((s) => s?.sequence ?? 0, () => 0);
        return {
          status: 'failed',
          sequence: seq,
          changed: [],
          error: (e as Error).message,
          reason: e instanceof Fail ? e.reason : 'network',
        };
      }
    },
  };
}
