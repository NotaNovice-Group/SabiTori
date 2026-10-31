import { describe, expect, it } from 'vitest';
import { createMemoryStore, createUpdateClient, generateKeypair, isAllowedPath, MAX_FILE_BYTES } from '../src/index.js';
import { BASE, buildSite, makeKeys, PHRASES, sha, siteFetch } from './helpers.js';

const content = { 'packs/fr/phrases.json': PHRASES, 'regions/CM/region.json': '{"code":"CM"}' };
const client = (keys: { publicKey: string }, site: { fetch: never }, store = createMemoryStore()) =>
  ({ store, c: createUpdateClient({ baseUrl: BASE, publicKeyBase64: keys.publicKey, store, fetch: site.fetch, now: () => Date.parse('2026-10-31T12:00:00Z') }) });

describe('update client', () => {
  it('installs a valid signed update, then reports up to date', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    const { store, c } = client(keys, site as never);
    const r = await c.check();
    expect(r).toMatchObject({ status: 'updated', sequence: 1 });
    expect(r.changed.sort()).toEqual(['packs/fr/phrases.json', 'regions/CM/region.json']);
    expect(new TextDecoder().decode((await store.getFile('packs/fr/phrases.json'))!)).toBe(PHRASES);
    expect(await c.check()).toMatchObject({ status: 'up_to_date', sequence: 1, changed: [] });
  });

  it('downloads only files whose hash changed', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    const s1 = buildSite({ keys, sequence: 1, content });
    await client(keys, s1 as never, store).c.check();
    const s2 = buildSite({ keys, sequence: 2, content: { ...content, 'packs/fr/phrases.json': '{"a":1}' } });
    const r = await client(keys, s2 as never, store).c.check();
    expect(r.changed).toEqual(['packs/fr/phrases.json']);
    expect(s2.requests.map((q) => q.url.slice(BASE.length + 1)).sort()).toEqual(['index.json', 'index.json.sig', 'packs/fr/phrases.json']);
    expect(await store.getFile('regions/CM/region.json')).not.toBeNull();
  });

  it('sends only the file path: no cookies, no query, no referrer', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    await client(keys, site as never).c.check();
    for (const q of site.requests) {
      expect(q.url).not.toMatch(/[?#]/);
      expect(q.init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', method: 'GET' });
      expect(q.init?.headers).toBeUndefined();
      expect(q.init?.body).toBeUndefined();
    }
  });

  it('rejects an invalid signature (tampered index)', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    const idx = new TextDecoder().decode(site.files.get('index.json')!).replace('"sequence":1', '"sequence":9');
    site.files.set('index.json', new TextEncoder().encode(idx));
    const r = await client(keys, site as never).c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_signature' });
  });

  it('rejects a signature by the wrong key', async () => {
    const site = buildSite({ keys: makeKeys(), sequence: 1, content });
    const r = await client(generateKeypair(), site as never).c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_signature' });
  });

  it('rejects garbage signatures and a garbage pinned key without throwing', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    site.files.set('index.json.sig', new TextEncoder().encode('not base64 !!'));
    expect((await client(keys, site as never).c.check()).status).toBe('failed');
    const ok = buildSite({ keys, sequence: 1, content });
    expect((await client({ publicKey: '%%%' }, ok as never).c.check()).status).toBe('failed');
  });

  it('rejects a file whose bytes were tampered with (hash mismatch) and installs nothing', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    site.files.set('packs/fr/phrases.json', new TextEncoder().encode(PHRASES.replace('2', '3')));
    const { store, c } = client(keys, site as never);
    const r = await c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_file' });
    expect(await store.getState()).toBeNull();
    expect(await store.getFile('regions/CM/region.json')).toBeNull();
  });

  it('rejects a file whose size differs from the signed size', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content, declare: (f) => (f.path.startsWith('packs') ? { ...f, size: f.size - 1 } : f) });
    expect(await client(keys, site as never).c.check()).toMatchObject({ status: 'failed', reason: 'bad_file' });
  });

  it('rejects an oversize file declared in a signed index', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content, declare: (f) => ({ ...f, size: MAX_FILE_BYTES + 1 }) });
    expect(await client(keys, site as never).c.check()).toMatchObject({ status: 'failed', reason: 'bad_index' });
  });

  it('rejects a file that is bigger than declared (never stores it)', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    site.files.set('packs/fr/phrases.json', new Uint8Array(5000));
    const { store, c } = client(keys, site as never);
    expect((await c.check()).status).toBe('failed');
    expect(await store.getStaged('packs/fr/phrases.json')).toBeNull();
  });

  it('rejects total size over 300 MB', async () => {
    const keys = makeKeys();
    const many = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`packs/fr/audio/c${i}.webm`, 'x']));
    const site = buildSite({ keys, sequence: 1, content: many, declare: (f) => ({ ...f, size: 19 * 1024 * 1024 }) });
    expect(await client(keys, site as never).c.check()).toMatchObject({ status: 'failed', reason: 'bad_index' });
  });

  it('rejects path traversal and paths outside the files the app reads', async () => {
    for (const bad of ['packs/../etc/passwd', 'packs/fr/../../x.json', '/packs/fr/phrases.json', 'packs/fr/evil.js', 'packs/fr/phrases.json/../x', 'regions/CM/../../a', 'other/x.json', 'packs//fr/phrases.json', 'packs/FR/phrases.json', 'packs/fr/audio/a b.webm']) {
      expect(isAllowedPath(bad), bad).toBe(false);
      const keys = makeKeys();
      const site = buildSite({ keys, sequence: 1, content: { [bad]: 'x' } });
      const store = createMemoryStore();
      const r = await client(keys, site as never, store).c.check();
      expect(r, bad).toMatchObject({ status: 'failed', reason: 'bad_index' });
      expect(await store.getState()).toBeNull();
    }
    for (const good of ['packs/index.json', 'packs/fr/manifest.json', 'packs/dua/audio/index.json', 'packs/dua/audio/num.1.webm', 'packs/dua/audio/x.m4a', 'regions/CM/region.json']) {
      expect(isAllowedPath(good), good).toBe(true);
    }
  });

  it('refuses a rollback to a lower sequence and keeps the installed set', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    await client(keys, buildSite({ keys, sequence: 5, content }) as never, store).c.check();
    const old = buildSite({ keys, sequence: 4, content: { 'packs/fr/phrases.json': '{"old":1}' } });
    const r = await client(keys, old as never, store).c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'rollback', sequence: 5 });
    expect(new TextDecoder().decode((await store.getFile('packs/fr/phrases.json'))!)).toBe(PHRASES);
  });

  it('a partial download failure keeps the previous set active', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    await client(keys, buildSite({ keys, sequence: 1, content }) as never, store).c.check();
    const next = { 'packs/fr/phrases.json': '{"v":2}', 'regions/CM/region.json': '{"code":"CM","v":2}' };
    const site = buildSite({ keys, sequence: 2, content: next });
    const base = site.fetch;
    site.fetch = async (u, i) => {
      if (u.endsWith('regions/CM/region.json')) throw new Error('connection lost');
      return base(u, i);
    };
    const r = await client(keys, site as never, store).c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'network', sequence: 1 });
    expect((await store.getState())!.sequence).toBe(1);
    expect(new TextDecoder().decode((await store.getFile('packs/fr/phrases.json'))!)).toBe(PHRASES);
    expect(await store.getStaged('packs/fr/phrases.json')).toBeNull();
    // and a retry succeeds
    const again = await client(keys, buildSite({ keys, sequence: 2, content: next }) as never, store).c.check();
    expect(again.status).toBe('updated');
  });

  it('a storage failure while staging keeps the previous set active', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    await client(keys, buildSite({ keys, sequence: 1, content }) as never, store).c.check();
    store.failOnStage = (p) => p.startsWith('regions');
    const r = await client(keys, buildSite({ keys, sequence: 2, content: { ...content, 'packs/fr/phrases.json': '{"v":2}', 'regions/CM/region.json': '{"v":2}' } }) as never, store).c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'store', sequence: 1 });
    expect(new TextDecoder().decode((await store.getFile('packs/fr/phrases.json'))!)).toBe(PHRASES);
  });

  it('drops files that a newer index no longer lists', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    await client(keys, buildSite({ keys, sequence: 1, content }) as never, store).c.check();
    await client(keys, buildSite({ keys, sequence: 2, content: { 'packs/fr/phrases.json': PHRASES } }) as never, store).c.check();
    expect(await store.getFile('regions/CM/region.json')).toBeNull();
  });

  it('reports a network error plainly', async () => {
    const keys = makeKeys();
    const r = await client(keys, siteFetch(new Map()) as never).c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'network', sequence: 0 });
  });

  it('sha helper agrees with node', () => {
    expect(sha(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('update client: hostile servers', () => {
  it('stops reading a body as soon as it passes the limit (never buffers a huge response)', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    const base = site.fetch;
    let served = 0;
    site.fetch = async (u, i) => {
      if (!u.endsWith('index.json')) return base(u, i);
      const chunk = new Uint8Array(1024 * 1024);
      let n = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(ctrl) {
          if (n++ >= 50) return ctrl.close();
          served += chunk.length;
          ctrl.enqueue(chunk);
        },
      });
      return new Response(body, { status: 200, headers: { 'content-length': '100' } });
    };
    const r = await client(keys, site as never).c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_file' });
    expect(served).toBeLessThanOrEqual(4 * 1024 * 1024); // the 2 MB index limit plus a chunk or two
  });

  it('a server that never answers fails the check with "network" instead of hanging it', async () => {
    const keys = makeKeys();
    const c = createUpdateClient({ baseUrl: BASE, publicKeyBase64: keys.publicKey, store: createMemoryStore(), fetch: (_u, i) => new Promise((_res, rej) => i?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))), idleTimeoutMs: 50 });
    const r = await c.check();
    expect(r).toMatchObject({ status: 'failed', reason: 'network' });
    expect(r.error).toMatch(/no answer/);
  });

  it('a body that stalls mid-way fails with "network" and nothing is installed', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    const base = site.fetch;
    site.fetch = async (u, i) => {
      if (!u.endsWith('phrases.json')) return base(u, i);
      const body = new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(new Uint8Array([123]));
          i?.signal?.addEventListener('abort', () => ctrl.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return new Response(body, { status: 200 });
    };
    const { store, c } = client(keys, site as never, createMemoryStore());
    const r = await createUpdateClient({ baseUrl: BASE, publicKeyBase64: keys.publicKey, store, fetch: site.fetch, idleTimeoutMs: 50 }).check();
    expect(r).toMatchObject({ status: 'failed', reason: 'network' });
    expect(await store.getState()).toBeNull();
    void c;
  });

  it('refuses a redirect to another origin, accepts one on the same origin', async () => {
    const keys = makeKeys();
    const redirectTo = (host: string) => {
      const site = buildSite({ keys, sequence: 1, content });
      const base = site.fetch;
      site.fetch = async (u, i) => {
        const r = await base(u, i);
        Object.defineProperty(r, 'url', { value: u.replace('https://u.example', host) });
        return r;
      };
      return site;
    };
    expect(await client(keys, redirectTo('https://evil.example') as never).c.check()).toMatchObject({ status: 'failed', reason: 'network' });
    expect(await client(keys, redirectTo('http://u.example') as never).c.check()).toMatchObject({ status: 'failed', reason: 'network' });
    expect((await client(keys, redirectTo('https://u.example') as never).c.check()).status).toBe('updated');
  });

  it('refuses a non-https update address', async () => {
    const keys = makeKeys();
    const site = buildSite({ keys, sequence: 1, content });
    const c = createUpdateClient({ baseUrl: 'http://u.example/sabi', publicKeyBase64: keys.publicKey, store: createMemoryStore(), fetch: site.fetch });
    expect(await c.check()).toMatchObject({ status: 'failed', reason: 'network' });
    expect(site.requests).toHaveLength(0);
  });

  it('re-downloads a file the active set lost, instead of failing every later update', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    await client(keys, buildSite({ keys, sequence: 1, content }) as never, store).c.check();
    store.dropActive!('regions/CM/region.json');
    const site = buildSite({ keys, sequence: 2, content: { ...content, 'packs/fr/phrases.json': '{"v":2}' } });
    const r = await client(keys, site as never, store).c.check();
    expect(r.status).toBe('updated');
    expect(r.changed.sort()).toEqual(['packs/fr/phrases.json', 'regions/CM/region.json']);
    expect(await store.getFile('regions/CM/region.json')).not.toBeNull();
  });
});
