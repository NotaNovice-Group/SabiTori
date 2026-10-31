import { describe, expect, it } from 'vitest';
import { createMemoryRegistry, createPackRegistry, type FetchLike } from '../src/index.js';
import { enRules, frRules, manifest } from './helpers.js';

function fakeFetch(files: Record<string, unknown>, log: string[] = []): FetchLike {
  return async (url) => {
    log.push(url);
    if (!(url in files)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => files[url] };
  };
}
const tts = (tag: string) => manifest(tag, { kind: 'tts', engine: 'system', bcp47: tag });
const phrases = { 'about.bank': { text: 'x', status: 'draft' as const } };

describe('createPackRegistry', () => {
  const files = {
    '/packs/index.json': { packs: ['fr', 'en'] },
    '/packs/fr/manifest.json': tts('fr'), '/packs/fr/phrases.json': phrases, '/packs/fr/rules.json': frRules,
    '/packs/en/manifest.json': tts('en'), '/packs/en/phrases.json': phrases, '/packs/en/rules.json': enRules,
  };
  it('loads, caches and builds clip urls', async () => {
    const log: string[] = [];
    const reg = createPackRegistry({ baseUrl: '/packs/', fetch: fakeFetch(files, log) });
    const a = await reg.get('fr');
    expect(await reg.get('fr')).toBe(a);
    expect(log.filter((u) => u.includes('/fr/'))).toHaveLength(3);
    expect(a.clipUrl!('num.7')).toBe('/packs/fr/audio/num.7.webm');
    expect((await reg.list()).map((m) => m.tag)).toEqual(['fr', 'en']);
  });
  it('reads audio/index.json for recorded packs', async () => {
    const reg = createPackRegistry({
      baseUrl: '/p',
      fetch: fakeFetch({
        '/p/xx/manifest.json': manifest('xx', { kind: 'recorded' }), '/p/xx/phrases.json': {}, '/p/xx/rules.json': enRules,
        '/p/xx/audio/index.json': { clips: ['num.1'] },
      }),
    });
    const p = (await reg.get('xx')) as { hasClip?: (id: string) => boolean };
    expect(p.hasClip!('num.1')).toBe(true);
    expect(p.hasClip!('num.2')).toBe(false);
  });
  it('clear errors', async () => {
    const reg = createPackRegistry({ baseUrl: '/packs', fetch: fakeFetch({ ...files, '/packs/fr/rules.json': { formatVersion: 1, numbers: { atoms: { 0: 'x' } } } }) });
    await expect(reg.get('fr')).rejects.toThrow(/numbers.atoms is missing "1"/);
    await expect(reg.get('zz')).rejects.toThrow(/HTTP 404/);
    const bad = createPackRegistry({ baseUrl: '/packs', fetch: fakeFetch({ ...files, '/packs/fr/phrases.json': { 'nope.key': {} } }) });
    await expect(bad.get('fr')).rejects.toThrow(/unknown phrase key "nope.key"/);
    const mism = createPackRegistry({ baseUrl: '/packs', fetch: fakeFetch({ ...files, '/packs/fr/manifest.json': tts('en') }) });
    await expect(mism.get('fr')).rejects.toThrow(/does not match/);
  });
  it('does not cache failures', async () => {
    const f: Record<string, unknown> = {};
    const reg = createPackRegistry({ baseUrl: '/packs', fetch: fakeFetch(f) });
    await expect(reg.get('fr')).rejects.toThrow();
    Object.assign(f, files);
    await expect(reg.get('fr')).resolves.toBeTruthy();
  });
});

describe('createMemoryRegistry', () => {
  it('serves packs, lists manifests, errors on unknown', async () => {
    const reg = createMemoryRegistry([{ manifest: tts('fr'), phrases, rules: frRules }]);
    expect((await reg.get('fr')).clipUrl!('a')).toBe('fr/audio/a.webm');
    expect((await reg.list())[0]!.tag).toBe('fr');
    await expect(reg.get('en')).rejects.toThrow(/en/);
  });
  it('validates rules (templates need words, joiners must exist)', () => {
    const bad = { ...frRules, dates: { ...frRules.dates!, templates: { full: '{day} of', noYear: '{day}' } } };
    expect(() => createMemoryRegistry([{ manifest: tts('fr'), phrases, rules: bad }])).toThrow(/literal text/);
    const bad2 = { ...frRules, numbers: { ...frRules.numbers, join: [{ token: 'zzz' }] } };
    expect(() => createMemoryRegistry([{ manifest: tts('fr'), phrases, rules: bad2 }])).toThrow(/unknown joiner/);
  });
});
