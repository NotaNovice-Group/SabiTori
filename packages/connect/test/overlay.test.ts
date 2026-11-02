import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore, createOverlayFetch, updatePathOfUrl, type FetchFn } from '../src/index.js';

describe('overlay fetch', () => {
  const bundled: FetchFn = vi.fn(async (u: string) => new Response(JSON.stringify({ from: 'bundled', u }), { status: 200 }));

  async function setup() {
    const store = createMemoryStore();
    const bytes = new TextEncoder().encode('{"from":"update"}');
    await store.stage('packs/fr/phrases.json', bytes);
    await store.commit({ sequence: 1, updatedAt: '', files: { 'packs/fr/phrases.json': { sha256: 'x', size: bytes.length } } });
    return createOverlayFetch(store, bundled);
  }

  it('serves the update set first', async () => {
    const f = await setup();
    for (const u of ['./packs/fr/phrases.json', '/packs/fr/phrases.json', 'https://localhost/packs/fr/phrases.json?x=1']) {
      expect(await (await f(u)).json()).toEqual({ from: 'update' });
    }
    expect(bundled).not.toHaveBeenCalled();
  });

  it('falls back to bundled assets when the path is not updated', async () => {
    const f = await setup();
    const res = await f('./packs/fr/rules.json');
    expect(((await res.json()) as { from: string }).from).toBe('bundled');
    expect(((await (await f('./ocr/fra.traineddata.gz')).json()) as { from: string }).from).toBe('bundled');
  });

  it('a failing store means bundled, never an error', async () => {
    const store = createMemoryStore();
    store.getFile = async () => {
      throw new Error('idb broke');
    };
    const f = createOverlayFetch(store, bundled);
    expect(((await (await f('./packs/fr/phrases.json')).json()) as { from: string }).from).toBe('bundled');
  });

  it('maps urls to update paths only for allowed files', () => {
    expect(updatePathOfUrl('./regions/CM/region.json')).toBe('regions/CM/region.json');
    expect(updatePathOfUrl('./packs/../secret')).toBeNull();
    expect(updatePathOfUrl('./index.html')).toBeNull();
  });
});
