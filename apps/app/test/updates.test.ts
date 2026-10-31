import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { signBytes } from '@sabitori/connect';

const keysP = vi.hoisted(async () => {
  // the pinned key of this test build, generated here so no secret ever sits in the repo
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const b64 = (jwk: string | undefined) => Buffer.from(jwk ?? '', 'base64url').toString('base64');
  return { secretKey: b64(privateKey.export({ format: 'jwk' }).d), publicKey: b64(publicKey.export({ format: 'jwk' }).x) };
});
vi.mock('../src/config', async () => ({
  config: { updates: { url: 'https://u.example/sabi', publicKey: (await keysP).publicKey }, crashReports: null },
  anyConnected: () => true,
}));

import { clearUpdates, loadMemo, runUpdateCheck, updateCheckRunning, updateStore } from '../src/lib/updates';

const keys = await keysP;
const enc = new TextEncoder();
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** A signed site; `hold` makes one file wait until released, so a check can be interrupted mid-way. */
function site(sequence: number, hold?: string) {
  const content: Record<string, Uint8Array> = { 'packs/fr/phrases.json': enc.encode('{"v":' + sequence + '}'), 'regions/CM/region.json': enc.encode('{"code":"CM"}') };
  const index = enc.encode(JSON.stringify({ formatVersion: 1, channel: 'stable', sequence, issuedAt: '2026-10-31T10:00:00Z', files: Object.entries(content).map(([path, b]) => ({ path, sha256: sha(b), size: b.length })) }));
  const files = new Map<string, Uint8Array>([...Object.entries(content), ['index.json', index], ['index.json.sig', enc.encode(signBytes(index, keys.secretKey))]]);
  const urls: string[] = [];
  let release: (() => void) | null = null;
  const held = new Promise<void>((res) => (release = res));
  const fetch = async (url: string, init?: RequestInit) => {
    urls.push(url);
    const path = url.replace('https://u.example/sabi/', '');
    if (path === hold) {
      await Promise.race([held, new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))]);
    }
    const b = files.get(path);
    return b ? new Response(b.slice().buffer, { status: 200 }) : new Response('', { status: 404 });
  };
  return { fetch, urls, release: () => release?.() };
}

describe('app update checks', () => {
  beforeEach(async () => {
    localStorage.clear();
    await updateStore().clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('installs through the real client, remembers the check, and coalesces concurrent checks', async () => {
    const s = site(1);
    vi.stubGlobal('fetch', s.fetch);
    const a = runUpdateCheck();
    const b = runUpdateCheck();
    expect(updateCheckRunning()).toBe(true);
    expect(await a).toMatchObject({ status: 'updated', sequence: 1 });
    expect(await b).toBe(await a);
    expect(updateCheckRunning()).toBe(false);
    expect(loadMemo()).toMatchObject({ lastStatus: 'updated', lastReason: null });
    expect(s.urls.filter((u) => u.endsWith('index.json'))).toHaveLength(1);
    // only GETs to the configured origin, nothing else in the URL
    for (const u of s.urls) expect(u).toMatch(/^https:\/\/u\.example\/sabi\/(index\.json(\.sig)?|packs\/fr\/phrases\.json|regions\/CM\/region\.json)$/);
  });

  it('deleting downloaded updates cancels a running check, so the deletion is not undone, and forgets the memo', async () => {
    vi.stubGlobal('fetch', site(1).fetch);
    await runUpdateCheck();
    expect(await updateStore().hasFile('packs/fr/phrases.json')).toBe(true);
    expect(loadMemo().lastCheckAt).not.toBeNull();

    const s2 = site(2, 'packs/fr/phrases.json');
    vi.stubGlobal('fetch', s2.fetch);
    const check = runUpdateCheck();
    await vi.waitFor(() => expect(s2.urls.some((u) => u.endsWith('packs/fr/phrases.json'))).toBe(true));
    await clearUpdates();
    s2.release();
    const r = await check;
    expect(r.status).toBe('failed');
    expect(await updateStore().getState()).toBeNull();
    expect(await updateStore().hasFile('packs/fr/phrases.json')).toBe(false);
    expect(await updateStore().getStaged('packs/fr/phrases.json')).toBeNull();
    expect(loadMemo().lastCheckAt).toBeNull();
    expect(updateCheckRunning()).toBe(false);
  });
});
