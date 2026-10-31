import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createIdbStore, createUpdateClient } from '../src/index.js';
import { BASE, buildSite, makeKeys } from './helpers.js';

describe('IndexedDB store', () => {
  it('works through the update client and survives re-opening', async () => {
    const factory = new IDBFactory();
    const keys = makeKeys();
    const store = createIdbStore(factory);
    const mk = (s: ReturnType<typeof buildSite>, st = store) => createUpdateClient({ baseUrl: BASE, publicKeyBase64: keys.publicKey, store: st, fetch: s.fetch });
    expect((await mk(buildSite({ keys, sequence: 1, content: { 'packs/fr/phrases.json': '{"a":1}', 'regions/CM/region.json': '{}' } })).check()).status).toBe('updated');
    const again = createIdbStore(factory);
    expect((await again.getState())!.sequence).toBe(1);
    expect(new TextDecoder().decode((await again.getFile('packs/fr/phrases.json'))!)).toBe('{"a":1}');
    const r = await mk(buildSite({ keys, sequence: 2, content: { 'packs/fr/phrases.json': '{"a":2}' } }), again).check();
    expect(r.changed).toEqual(['packs/fr/phrases.json']);
    expect(await again.getFile('regions/CM/region.json')).toBeNull();
    expect(await again.getStaged('packs/fr/phrases.json')).toBeNull();
  });

  it('commit of an unstaged file aborts and changes nothing', async () => {
    const store = createIdbStore(new IDBFactory());
    await store.stage('packs/fr/phrases.json', new Uint8Array([1]));
    await store.commit({ sequence: 1, updatedAt: '', files: { 'packs/fr/phrases.json': { sha256: 'a', size: 1 } } });
    await expect(store.commit({ sequence: 2, updatedAt: '', files: { 'packs/fr/rules.json': { sha256: 'b', size: 1 } } })).rejects.toThrow();
    expect((await store.getState())!.sequence).toBe(1);
    expect(await store.getFile('packs/fr/phrases.json')).not.toBeNull();
    await store.clear();
    expect(await store.getState()).toBeNull();
  });
});

describe('IndexedDB store: self-heal', () => {
  it('a file missing from the active set is downloaded again by the next update', async () => {
    const factory = new IDBFactory();
    const keys = makeKeys();
    const store = createIdbStore(factory);
    const content = { 'packs/fr/phrases.json': '{"a":1}', 'regions/CM/region.json': '{}' };
    const mk = (s: ReturnType<typeof buildSite>) => createUpdateClient({ baseUrl: BASE, publicKeyBase64: keys.publicKey, store, fetch: s.fetch });
    expect((await mk(buildSite({ keys, sequence: 1, content })).check()).status).toBe('updated');
    expect(await store.hasFile('regions/CM/region.json')).toBe(true);
    const db = await new Promise<IDBDatabase>((res) => {
      const q = factory.open('sabitori-updates', 1);
      q.onsuccess = () => res(q.result);
    });
    await new Promise<void>((res) => {
      const tx = db.transaction('active', 'readwrite');
      tx.objectStore('active').delete('regions/CM/region.json');
      tx.oncomplete = () => res();
    });
    expect(await store.hasFile('regions/CM/region.json')).toBe(false);
    const r = await mk(buildSite({ keys, sequence: 2, content: { ...content, 'packs/fr/phrases.json': '{"a":2}' } })).check();
    expect(r.status).toBe('updated');
    expect(r.changed.sort()).toEqual(['packs/fr/phrases.json', 'regions/CM/region.json']);
    expect(await store.hasFile('regions/CM/region.json')).toBe(true);
  });
});
