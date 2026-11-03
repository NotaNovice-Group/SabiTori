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
/** A phrases.json the app accepts (a real catalog key). Updates are content-checked, so test files must be valid. */
export const phrasesJson = (text: string): string => JSON.stringify({ 'deadline.none': { text, status: 'reviewed' } });
export const PHRASES = phrasesJson('Bonjour 2');
/** A region.json the app accepts. */
export const regionJson = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    formatVersion: 1, code: 'CM', name: 'Cameroon', timezone: 'Africa/Douala', currency: { code: 'XAF', aliases: ['FCFA'] },
    phone: { countryCode: '237', nationalPattern: '6\\d{8}' }, languages: ['fr', 'en'], officialSenders: [], ...extra,
  });
export const REGION = regionJson();
/** A manifest.json the app accepts. */
export const manifestJson = (tag: string, over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    formatVersion: 1, tag, name: tag, autonym: tag, script: 'Latn', direction: 'ltr', fallback: [], voice: { kind: 'tts', engine: 'system', bcp47: tag },
    reads: false, status: 'beta', regions: ['CM'], license: 'CC-BY-4.0', contributors: [], version: '0.1.0', ...over,
  });
