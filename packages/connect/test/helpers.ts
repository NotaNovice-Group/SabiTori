import { createHash } from 'node:crypto';
import { generateKeypair, signBytes } from '../src/index.js';
import type { FetchFn, IndexFile } from '../src/index.js';

const enc = new TextEncoder();
export const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export interface Site {
  files: Map<string, Uint8Array>;
  fetch: FetchFn;
  requests: { url: string; init?: RequestInit }[];
}

export function makeKeys() {
  return generateKeypair();
}

/** Builds a signed update site in memory. `tamper` lets a test break one part after signing. */
export function buildSite(opts: {
  keys: { secretKey: string };
  sequence: number;
  content: Record<string, string | Uint8Array>;
  declare?: (f: IndexFile) => IndexFile;
  indexExtra?: Record<string, unknown>;
}): Site {
  const files = new Map<string, Uint8Array>();
  const list: IndexFile[] = [];
  for (const [path, v] of Object.entries(opts.content)) {
    const bytes = typeof v === 'string' ? enc.encode(v) : v;
    files.set(path, bytes);
    const f = { path, sha256: sha(bytes), size: bytes.length };
    list.push(opts.declare ? opts.declare(f) : f);
  }
  const index = enc.encode(
    JSON.stringify({ formatVersion: 1, channel: 'stable', sequence: opts.sequence, issuedAt: '2026-10-31T10:00:00Z', files: list, ...opts.indexExtra }),
  );
  files.set('index.json', index);
  files.set('index.json.sig', enc.encode(signBytes(index, opts.keys.secretKey)));
  return siteFetch(files);
}

export function siteFetch(files: Map<string, Uint8Array>, base = 'https://u.example/sabi'): Site {
  const requests: Site['requests'] = [];
  const f: FetchFn = async (url, init) => {
    requests.push({ url, init });
    const path = url.slice(base.length + 1);
    const b = files.get(path);
    if (!b) return new Response('nope', { status: 404 });
    return new Response(b.slice().buffer, { status: 200 });
  };
  return { files, fetch: f, requests };
}

export const BASE = 'https://u.example/sabi';
export const PHRASES = JSON.stringify({ hello: { text: 'Bonjour 2' } });
