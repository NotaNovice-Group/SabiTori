import type { Blobs, Store } from './store';
import { AUDIO_TYPES, checkScamReport, checkTeaching } from './validate';

export interface Env {
  allowedOrigins: string[];
  maxPostsPerDay: number;
  adminToken?: string;
  rateSalt?: string;
}

export interface Deps {
  store: Store;
  blobs: Blobs;
  env: Env;
  now?: () => Date;
  newId?: () => string;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

function cors(origin: string | null, env: Env): Record<string, string> {
  if (!origin || !env.allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Reports and teachings (and their recordings) are deleted this many days after they arrive (docs/privacy.md, 5.4). */
export const RETENTION_DAYS = 90;

/** Deletes everything older than RETENTION_DAYS. Run once a day by the worker's cron (wrangler.toml). */
export async function purgeOld(store: Store, blobs: Blobs, now: Date): Promise<number> {
  const before = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  const keys = await store.purge(before);
  for (const k of keys) await blobs.delete(k);
  return keys.length;
}

/**
 * A sender may attach `deleteKey`: a random secret only their phone keeps. We store its SHA-256, never the key, so
 * only that phone can later delete the item (POST /v1/delete), with no account and nothing that names the person.
 */
const DELETE_KEY = /^[A-Za-z0-9_-]{22,128}$/;
function takeDeleteKey(body: unknown): { body: unknown; key?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('deleteKey' in body)) return { body };
  const { deleteKey, ...rest } = body as Record<string, unknown>;
  return typeof deleteKey === 'string' && DELETE_KEY.test(deleteKey) ? { body: rest, key: deleteKey } : { body: rest };
}

/** Max request body: a teaching with 1.5 MB of audio in base64, plus the text fields. */
const MAX_BODY = 2_200_000;

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const { store, blobs, env } = deps;
  const now = deps.now?.() ?? new Date();
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const url = new URL(req.url);
  const h = cors(req.headers.get('origin'), env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const path = url.pathname.replace(/\/+$/, '');

  if (req.method === 'GET' && path === '/v1/health') return json({ ok: true }, 200, h);

  // Published scam reports of a region, newest first, with how many published reports share each number.
  if (req.method === 'GET' && path === '/v1/scams') {
    const region = (url.searchParams.get('region') ?? 'CM').toUpperCase();
    if (!/^[A-Z]{2}$/.test(region)) return json({ error: 'region' }, 400, h);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100));
    const items = await store.published(region, limit);
    return json({ region, items, generatedAt: now.toISOString() }, 200, { ...h, 'cache-control': 'public, max-age=300' });
  }

  // Admin (owner only): review queue, publish or reject, export teachings for training.
  if (path.startsWith('/v1/admin/')) {
    const auth = req.headers.get('authorization') ?? '';
    if (!env.adminToken || auth !== `Bearer ${env.adminToken}`) return json({ error: 'unauthorized' }, 401);
    if (req.method === 'GET' && path === '/v1/admin/scams') return json({ items: await store.pending(200) });
    const m = /^\/v1\/admin\/scams\/([0-9a-f-]{8,40})$/.exec(path);
    if (req.method === 'POST' && m) {
      const b = (await req.json().catch(() => null)) as { status?: string } | null;
      if (b?.status !== 'published' && b?.status !== 'rejected') return json({ error: 'status' }, 400);
      return (await store.review(m[1]!, b.status, now.toISOString())) ? json({ ok: true }) : json({ error: 'not_found' }, 404);
    }
    if (req.method === 'GET' && path === '/v1/admin/teachings') {
      const since = url.searchParams.get('since') ?? '1970-01-01';
      return json({ items: await store.teachings(since, 1000) });
    }
    return json({ error: 'not_found' }, 404);
  }

  // Delete one report or teaching sent from this phone: needs the secret the phone attached when it sent it.
  if (req.method === 'POST' && path === '/v1/delete') {
    const b = (await req.json().catch(() => null)) as { kind?: unknown; id?: unknown; key?: unknown } | null;
    if (!b || (b.kind !== 'scam' && b.kind !== 'teach') || typeof b.id !== 'string' || !/^[0-9a-f-]{8,40}$/.test(b.id) || typeof b.key !== 'string' || !DELETE_KEY.test(b.key)) {
      return json({ error: 'bad_request' }, 400, h);
    }
    const r = await store.remove(b.kind, b.id, await sha256Hex(b.key));
    if (!r) return json({ error: 'not_found' }, 404, h); // already deleted (or 90 days passed), or a wrong key
    if (r.audioKey) await blobs.delete(r.audioKey);
    return json({ ok: true }, 200, h);
  }

  if (req.method === 'POST' && (path === '/v1/scams' || path === '/v1/teach')) {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return json({ error: 'too_large' }, 413, h);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413, h);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: 'json' }, 400, h);
    }
    const { body, key } = takeDeleteKey(parsed);
    const deleteHash = key ? await sha256Hex(key) : undefined;
    // A limit per address per day, counted under a salted hash: no address is ever stored.
    const day = now.toISOString().slice(0, 10);
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    const bucket = await sha256Hex(`${env.rateSalt ?? ''}|${day}|${ip}`);
    if ((await store.bump(bucket, day)) > env.maxPostsPerDay) return json({ error: 'rate_limited' }, 429, h);
    const id = newId();
    const at = now.toISOString();
    if (path === '/v1/scams') {
      const c = checkScamReport(body);
      if (!c.ok) return json({ error: c.error }, 400, h);
      await store.addScam(id, at, c.value, deleteHash);
      return json({ id, status: 'pending' }, 201, h);
    }
    const c = checkTeaching(body);
    if (!c.ok) return json({ error: c.error }, 400, h);
    const { audio, ...rest } = c.value;
    let audioKey: string | undefined;
    if (audio) {
      audioKey = `teach/${rest.lang}/${day}/${id}.${AUDIO_TYPES[audio.type]}`;
      await blobs.put(audioKey, fromBase64(audio.base64), audio.type);
    }
    await store.addTeaching(id, at, { ...rest, ...(audioKey ? { audioKey, audioType: audio!.type } : {}) }, deleteHash);
    return json({ id }, 201, h);
  }

  return json({ error: 'not_found' }, 404, h);
}
