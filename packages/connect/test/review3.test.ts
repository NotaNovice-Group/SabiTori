/** Regression tests for review rounds R3 and R4 (update channel). */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { requiredClips, isId } from '@sabitori/speech';
import {
  clearUpdates, createIdbStore, createMemoryStore, createOverlayFetch, createUpdateClient, isAllowedPath, parseIndex, quarantineActive, validateUpdateFile, verifyActiveUpdates,
  signBytes, type FetchFn, type UpdateStore,
} from '../src/index.js';
import { BASE, buildSite, makeKeys, manifestJson, phrasesJson, REGION, regionJson, sha, siteFetch } from './helpers.js';

const repo = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(join(repo, p), 'utf8');
const enc = new TextEncoder();
const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync('node', [join(repo, 'scripts', script), ...args], { env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const runFail = (script: string, args: string[], env: Record<string, string> = {}): string => {
  try {
    run(script, args, env);
  } catch (e) {
    return String((e as { stderr?: string }).stderr ?? e);
  }
  throw new Error('expected the script to fail');
};
const mk = (keys: { publicKey: string }, site: { fetch: FetchFn }, store: UpdateStore, extra: { tags?: string[] | (() => string[]) } = {}) =>
  createUpdateClient({ baseUrl: BASE, publicKeyBase64: keys.publicKey, store, fetch: site.fetch, ...extra });

describe('2. the update path allow-list follows validate.ts', () => {
  it('accepts upper-case clip names and BCP 47 tags', () => {
    for (const p of [
      'packs/lns/audio/currency.XAF.webm', 'packs/lns/audio/currency.XAF.plural.m4a', 'packs/lns/audio/sender.mtn-momo.webm', 'packs/lns/audio/scam.signal.account_block_threat.0.webm',
      'packs/pcm-CM/manifest.json', 'packs/pcm-CM/audio/index.json', 'packs/pcm-CM/audio/num.7.webm', 'packs/ff-Latn-CM/phrases.json', 'packs/lns/voice/lns_CM-ama-medium.onnx.json', 'packs/lns/index.json',
    ]) expect(isAllowedPath(p), p).toBe(true);
  });
  it('still refuses tricks, other extensions, upper-case primary tags and over-long names', () => {
    for (const p of [
      'packs/PCM/manifest.json', 'packs/pcm-CM/../x.json', 'packs/lns/audio/num.7.wav', 'packs/lns/audio/num..7.webm', 'packs/lns/audio/.hidden.webm', 'packs/lns/audio/a b.webm', 'packs/lns/audio/a/b.webm',
      `packs/lns/audio/${'a'.repeat(101)}.webm`, `packs/${'a'.repeat(36)}/manifest.json`, 'packs/lns/phrases.js', 'regions/cm/region.json',
    ]) expect(isAllowedPath(p), p).toBe(false);
  });
  it('every clip id the speech package can require is allowed (same spelling rules as validate.ts)', () => {
    const rules = JSON.parse(read('packs/en/rules.json'));
    const pack = { manifest: JSON.parse(manifestJson('xzz', { voice: { kind: 'recorded' } })), phrases: { 'scam.likely': { text: 'x', status: 'draft', audio: [{ clip: 'scam.likely.0' }] } }, rules };
    const ids = requiredClips(pack as never, { region: { officialSenders: [{ id: 'mtn-momo' }, { id: 'orange_money' }] } as never });
    expect(ids).toContain('currency.XAF');
    for (const id of ids) {
      expect(isId(id), id).toBe(true);
      expect(isAllowedPath(`packs/xzz/audio/${id}.webm`), id).toBe(true);
      expect(isAllowedPath(`packs/xzz/audio/${id}.m4a`), id).toBe(true);
    }
  });
  it('the update client installs a pack with upper-case clips and a BCP 47 tag', async () => {
    const keys = makeKeys();
    const content = {
      'packs/pcm-CM/audio/currency.XAF.webm': 'x', 'packs/pcm-CM/audio/num.1.m4a': 'y',
      'packs/pcm-CM/audio/index.json': JSON.stringify({ clips: ['currency.XAF', { id: 'num.1', file: 'num.1.m4a' }] }),
    };
    const store = createMemoryStore();
    const r = await mk(keys, buildSite({ keys, sequence: 1, content }), store).check();
    expect(r.status).toBe('updated');
    expect(await store.hasFile('packs/pcm-CM/audio/currency.XAF.webm')).toBe(true);
  });
});

describe('13. content validation before staging', () => {
  const rulesEn = read('packs/en/rules.json');
  const good: Record<string, string> = {
    'packs/xzz/manifest.json': manifestJson('xzz'),
    'packs/xzz/phrases.json': phrasesJson('Aha'),
    'packs/xzz/rules.json': rulesEn,
    'packs/xzz/reading.json': read('packs/fr/reading.json').replace('"tag": "fr"', '"tag": "xzz"'),
    'packs/xzz/audio/index.json': JSON.stringify({ clips: [{ id: 'num.1', file: 'num.1.m4a' }] }),
    'packs/xzz/audio/num.1.m4a': 'audio',
    'packs/index.json': JSON.stringify({ packs: ['fr', 'xzz'] }),
    'regions/CM/region.json': REGION,
  };
  it('accepts good content of every kind', () => {
    for (const [p, c] of Object.entries(good)) expect(() => validateUpdateFile(p, enc.encode(c)), p).not.toThrow();
  });
  it('accepts every file of the real repo that the app reads', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    let n = 0;
    for (const top of ['packs', 'regions']) {
      for (const abs of walk(join(repo, top))) {
        const p = relative(repo, abs).split('\\').join('/');
        if (!isAllowedPath(p) || /\.onnx$/.test(p)) continue;
        expect(() => validateUpdateFile(p, readFileSync(abs)), p).not.toThrow();
        n++;
      }
    }
    expect(n).toBeGreaterThan(15);
  });
  const bad: [string, string, string, RegExp][] = [
    ['not JSON', 'packs/xzz/phrases.json', '{nope', /not valid JSON/],
    ['empty file', 'packs/xzz/phrases.json', '', /is empty/],
    ['manifest tag mismatch', 'packs/xzz/manifest.json', manifestJson('abc'), /does not match folder/],
    ['manifest without voice', 'packs/xzz/manifest.json', manifestJson('xzz', { voice: 3 }), /voice must be an object/],
    ['unknown phrase key', 'packs/xzz/phrases.json', JSON.stringify({ 'no.such.key': { text: 'x', status: 'draft' } }), /unknown phrase key/],
    ['rules that cannot say numbers', 'packs/xzz/rules.json', JSON.stringify({ formatVersion: 1, numbers: { atoms: { 0: 'a' } } }), /atoms is missing/],
    ['reading with 11 months', 'packs/xzz/reading.json', JSON.stringify({ formatVersion: 1, tag: 'xzz', months: Array(11).fill(['a']), weekdays: Array(7).fill(['a']) }), /months must be 12 lists/],
    ['reading of another tag', 'packs/xzz/reading.json', good['packs/xzz/reading.json']!.replace('"xzz"', '"zzz"'), /does not match folder/],
    ['region without phone', 'regions/CM/region.json', regionJson({ phone: {} }), /phone must be/],
    ['region with a broken pattern', 'regions/CM/region.json', regionJson({ phone: { countryCode: '237', nationalPattern: '(' } }), /not a valid regular expression/],
    ['region of another code', 'regions/CM/region.json', regionJson({ code: 'GA' }), /does not match folder/],
    ['region with a bad time zone', 'regions/CM/region.json', regionJson({ timezone: 'Mars/Base' }), /not a known time zone/],
    ['packs index with a bad tag', 'packs/index.json', JSON.stringify({ packs: ['fr', '../x'] }), /valid language tags/],
    ['audio index with a wrong extension', 'packs/xzz/audio/index.json', JSON.stringify({ clips: [{ id: 'a', file: 'a.wav' }] }), /must be "a.webm" or "a.m4a"/],
    ['piper config without a map', 'packs/xzz/voice/v.onnx.json', JSON.stringify({ audio: { sample_rate: 22050 } }), /phoneme_id_map/],
  ];
  for (const [name, path, content, re] of bad) {
    it(`refuses ${name}`, () => {
      expect(() => validateUpdateFile(path, enc.encode(content))).toThrow(re);
    });
  }
  it('one bad file fails the whole update: nothing is installed, nothing stays staged, the old set stays active', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    const ok = { 'packs/xzz/phrases.json': phrasesJson('v1'), 'regions/CM/region.json': REGION };
    expect((await mk(keys, buildSite({ keys, sequence: 1, content: ok }), store).check()).status).toBe('updated');
    const next = { 'packs/xzz/phrases.json': phrasesJson('v2'), 'packs/xzz/rules.json': JSON.stringify({ formatVersion: 1, numbers: { atoms: { 0: 'a' } } }), 'regions/CM/region.json': REGION };
    const r = await mk(keys, buildSite({ keys, sequence: 2, content: next }), store).check();
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_file', sequence: 1, file: 'packs/xzz/rules.json' });
    expect(r.error).toMatch(/was not installed because packs\/xzz\/rules\.json: .*atoms is missing "1"/);
    expect(new TextDecoder().decode((await store.getFile('packs/xzz/phrases.json'))!)).toBe(phrasesJson('v1'));
    expect(await store.getFile('packs/xzz/rules.json')).toBeNull();
    for (const p of Object.keys(next)) expect(await store.getStaged(p)).toBeNull();
    expect((await store.getState())!.sequence).toBe(1);
  });
  it('a signed update with a manifest the app would refuse is not installed', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    const r = await mk(keys, buildSite({ keys, sequence: 1, content: { 'packs/xzz/manifest.json': manifestJson('xzz', { fallback: ['xzz'] }) } }), store).check();
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_file', file: 'packs/xzz/manifest.json' });
    expect(r.error).toMatch(/fallback must not list the pack itself/);
    expect(await store.getState()).toBeNull();
  });
});

describe('13. quarantineActive, clearUpdates and verifyActiveUpdates', () => {
  const content = { 'packs/fr/phrases.json': phrasesJson('v1'), 'regions/CM/region.json': REGION };
  async function installed(store: UpdateStore) {
    const keys = makeKeys();
    await mk(keys, buildSite({ keys, sequence: 3, content }), store).check();
    return keys;
  }
  for (const [name, make] of [['memory', () => createMemoryStore()], ['IndexedDB', () => createIdbStore(new IDBFactory())]] as const) {
    it(`${name}: quarantine stops serving the update files and keeps the sequence`, async () => {
      const store = make();
      const keys = await installed(store);
      const bundled: FetchFn = async () => new Response('bundled');
      const overlay = createOverlayFetch(store, bundled);
      expect(await (await overlay('./packs/fr/phrases.json')).text()).toBe(phrasesJson('v1'));
      expect(await quarantineActive(store, 'app did not start')).toEqual({ quarantined: true, sequence: 3 });
      expect(await (await overlay('./packs/fr/phrases.json')).text()).toBe('bundled');
      expect(await store.getFile('packs/fr/phrases.json')).toBeNull();
      expect(await store.hasFile('packs/fr/phrases.json')).toBe(false);
      expect((await store.getState())!.quarantined!.reason).toBe('app did not start');
      expect((await verifyActiveUpdates(store)).quarantined).toBe(true);
      // the same update is not brought back; rollback protection still holds
      expect((await mk(keys, buildSite({ keys, sequence: 3, content }), store).check()).status).toBe('up_to_date');
      expect(await store.getFile('packs/fr/phrases.json')).toBeNull();
      expect((await mk(keys, buildSite({ keys, sequence: 2, content }), store).check()).reason).toBe('rollback');
      // a newer update replaces the quarantined set
      const r = await mk(keys, buildSite({ keys, sequence: 4, content: { ...content, 'packs/fr/phrases.json': phrasesJson('v4') } }), store).check();
      expect(r.status).toBe('updated');
      expect(r.changed.sort()).toEqual(['packs/fr/phrases.json', 'regions/CM/region.json']);
      expect(await (await overlay('./packs/fr/phrases.json')).text()).toBe(phrasesJson('v4'));
      expect((await store.getState())!.quarantined).toBeUndefined();
    });
    it(`${name}: clearUpdates forgets everything`, async () => {
      const store = make();
      await installed(store);
      await clearUpdates(store);
      expect(await store.getState()).toBeNull();
      expect(await store.getFile('packs/fr/phrases.json')).toBeNull();
    });
  }
  it('quarantine of an empty store does nothing and never throws', async () => {
    const store = createMemoryStore();
    expect(await quarantineActive(store)).toEqual({ quarantined: false, sequence: 0 });
    const broken = { ...store, getState: async () => { throw new Error('IDB gone'); } } as UpdateStore;
    expect(await quarantineActive(broken)).toEqual({ quarantined: false, sequence: 0 });
    expect((await verifyActiveUpdates(broken)).ok).toBe(false);
  });
  it('a store without quarantine support is cleared instead', async () => {
    const store = createMemoryStore();
    await installed(store);
    const legacy: UpdateStore = { ...store, quarantine: undefined };
    expect((await quarantineActive(legacy)).quarantined).toBe(true);
    expect(await store.getState()).toBeNull();
  });
  it('verifyActiveUpdates finds a damaged or missing file of the active set', async () => {
    const store = createMemoryStore();
    await installed(store);
    expect(await verifyActiveUpdates(store)).toMatchObject({ ok: true, sequence: 3, problems: [] });
    await store.stage('packs/fr/phrases.json', enc.encode('{"broken'));
    await store.commit({ sequence: 3, updatedAt: '', files: { 'packs/fr/phrases.json': { sha256: 'x', size: 8 }, 'regions/CM/region.json': { sha256: sha(enc.encode(REGION)), size: REGION.length } } });
    const v = await verifyActiveUpdates(store);
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual([{ path: 'packs/fr/phrases.json', message: expect.stringMatching(/not valid JSON/) }]);
  });
});

describe('14. per-language update channels', () => {
  /** A signed index with `languages`: shared files at the root, each language has its own list. */
  function langSite(opts: { keys: { secretKey: string }; sequence: number; shared: Record<string, string>; langs: Record<string, Record<string, string>>; tweak?: (lists: Record<string, Record<string, unknown>>) => void }) {
    const files = new Map<string, Uint8Array>();
    const entry = (path: string, content: string) => {
      const b = enc.encode(content);
      files.set(path, b);
      return { path, sha256: sha(b), size: b.length };
    };
    const rootFiles = Object.entries(opts.shared).map(([p, c]) => entry(p, c));
    const languages: Record<string, unknown> = {};
    const lists: Record<string, Record<string, unknown>> = {};
    for (const [tag, content] of Object.entries(opts.langs)) lists[tag] = { formatVersion: 1, tag, files: Object.entries(content).map(([p, c]) => entry(p, c)) };
    opts.tweak?.(lists);
    for (const [tag, list] of Object.entries(lists)) {
      const e = entry(`packs/${tag}/index.json`, JSON.stringify(list));
      languages[tag] = { index: e, version: '0.1.0' };
    }
    const index = enc.encode(JSON.stringify({ formatVersion: 1, channel: 'stable', sequence: opts.sequence, issuedAt: '2026-11-01T10:00:00Z', files: rootFiles, languages }));
    files.set('index.json', index);
    files.set('index.json.sig', enc.encode(signBytes(index, opts.keys.secretKey)));
    return siteFetch(files);
  }
  const shared = { 'packs/index.json': JSON.stringify({ packs: ['fr', 'lns', 'ewo'] }), 'regions/CM/region.json': REGION };
  const langs = () => ({
    fr: { 'packs/fr/manifest.json': manifestJson('fr'), 'packs/fr/phrases.json': phrasesJson('fr') },
    lns: { 'packs/lns/manifest.json': manifestJson('lns', { voice: { kind: 'recorded' } }), 'packs/lns/phrases.json': phrasesJson('lns'), 'packs/lns/audio/index.json': JSON.stringify({ clips: ['num.1'] }), 'packs/lns/audio/num.1.webm': 'a' },
    ewo: { 'packs/ewo/manifest.json': manifestJson('ewo'), 'packs/ewo/phrases.json': phrasesJson('ewo') },
  });
  const paths = (s: { requests: { url: string }[] }) => s.requests.map((q) => q.url.slice(BASE.length + 1)).sort();

  it('a phone downloads only the languages it asks for, plus the shared files', async () => {
    const keys = makeKeys();
    const site = langSite({ keys, sequence: 1, shared, langs: langs() });
    const store = createMemoryStore();
    const r = await mk(keys, site, store).check({ tags: ['lns'] });
    expect(r).toMatchObject({ status: 'updated', languages: ['lns'] });
    expect(paths(site)).toEqual(['index.json', 'index.json.sig', 'packs/index.json', 'packs/lns/audio/index.json', 'packs/lns/audio/num.1.webm', 'packs/lns/index.json', 'packs/lns/manifest.json', 'packs/lns/phrases.json', 'regions/CM/region.json']);
    expect(await store.hasFile('packs/lns/audio/num.1.webm')).toBe(true);
    expect(await store.hasFile('packs/fr/phrases.json')).toBe(false);
    expect(Object.keys((await store.getState())!.files).some((p) => p.endsWith('/index.json') && p.startsWith('packs/lns/index'))).toBe(false);
  });
  it('without tags every language of the index is downloaded; `tags` may be a function of the client', async () => {
    const keys = makeKeys();
    const all = await mk(keys, langSite({ keys, sequence: 1, shared, langs: langs() }), createMemoryStore()).check();
    expect(all.languages).toEqual(['ewo', 'fr', 'lns']);
    const store = createMemoryStore();
    const r = await mk(keys, langSite({ keys, sequence: 1, shared, langs: langs() }), store, { tags: () => ['ewo', 'zzz'] }).check();
    expect(r.languages).toEqual(['ewo']);
  });
  it('same sequence, new language: the missing language is fetched; nothing else is; asking again is up to date', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    await mk(keys, langSite({ keys, sequence: 5, shared, langs: langs() }), store).check({ tags: ['fr'] });
    const site = langSite({ keys, sequence: 5, shared, langs: langs() });
    const r = await mk(keys, site, store).check({ tags: ['fr', 'ewo'] });
    expect(r.status).toBe('updated');
    expect(r.changed.sort()).toEqual(['packs/ewo/manifest.json', 'packs/ewo/phrases.json']);
    expect(paths(site)).not.toContain('packs/fr/phrases.json');
    const again = langSite({ keys, sequence: 5, shared, langs: langs() });
    expect((await mk(keys, again, store).check({ tags: ['fr', 'ewo'] })).status).toBe('up_to_date');
    expect(paths(again)).toEqual(['index.json', 'index.json.sig']);
  });
  it('a language no longer asked for is dropped from the active set', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    await mk(keys, langSite({ keys, sequence: 1, shared, langs: langs() }), store).check();
    await mk(keys, langSite({ keys, sequence: 1, shared, langs: langs() }), store).check({ tags: ['fr'] });
    expect(await store.hasFile('packs/lns/phrases.json')).toBe(false);
    expect(await store.hasFile('packs/fr/phrases.json')).toBe(true);
  });
  it('an unchanged language is not downloaded again when the sequence moves on', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    await mk(keys, langSite({ keys, sequence: 1, shared, langs: langs() }), store).check({ tags: ['fr', 'lns'] });
    const next = langs();
    next.fr['packs/fr/phrases.json'] = phrasesJson('fr 2');
    const site = langSite({ keys, sequence: 2, shared, langs: next });
    const r = await mk(keys, site, store).check({ tags: ['fr', 'lns'] });
    expect(r.changed).toEqual(['packs/fr/phrases.json']);
  });
  it('the signed index pins each language list by hash: a swapped list is refused', async () => {
    const keys = makeKeys();
    const site = langSite({ keys, sequence: 1, shared, langs: langs() });
    site.files.set('packs/lns/index.json', enc.encode(JSON.stringify({ formatVersion: 1, tag: 'lns', files: [] })));
    const r = await mk(keys, site, createMemoryStore()).check({ tags: ['lns'] });
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_file', file: 'packs/lns/index.json' });
  });
  it('a language list may only list files of its own language', async () => {
    const keys = makeKeys();
    const store = createMemoryStore();
    const site = langSite({
      keys, sequence: 1, shared, langs: langs(),
      tweak: (lists) => { (lists.lns!.files as unknown[]).push({ path: 'packs/fr/phrases.json', sha256: 'a'.repeat(64), size: 1 }); },
    });
    const r = await mk(keys, site, store).check({ tags: ['lns'] });
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_index' });
    expect(r.error).toMatch(/not a file of language lns/);
    expect(await store.getState()).toBeNull();
  });
  it('the root index must not also list a language\'s files, and a list must say its own tag', () => {
    const idx = (files: unknown[], languages: unknown) => enc.encode(JSON.stringify({ formatVersion: 1, channel: 'stable', sequence: 1, issuedAt: '2026-11-01T10:00:00Z', files, languages }));
    const f = { path: 'packs/lns/phrases.json', sha256: 'a'.repeat(64), size: 1 };
    const l = { lns: { index: { path: 'packs/lns/index.json', sha256: 'b'.repeat(64), size: 5 } } };
    expect(() => parseIndex(idx([f], l))).toThrow(/belongs to language lns/);
    expect(() => parseIndex(idx([], { lns: { index: { path: 'packs/fr/index.json', sha256: 'b'.repeat(64), size: 5 } } }))).toThrow(/must point at packs\/lns\/index.json/);
    expect(() => parseIndex(idx([], l))).not.toThrow();
  });
  it('content validation applies to the files of the selected languages', async () => {
    const keys = makeKeys();
    const bad = langs();
    bad.lns['packs/lns/phrases.json'] = '{"no.such.key":{"text":"x","status":"draft"}}';
    const r = await mk(keys, langSite({ keys, sequence: 1, shared, langs: bad }), createMemoryStore()).check({ tags: ['lns'] });
    expect(r).toMatchObject({ status: 'failed', reason: 'bad_file', file: 'packs/lns/phrases.json' });
    // a language nobody asked for is never downloaded, so its bad file cannot hurt
    const ok = await mk(keys, langSite({ keys, sequence: 1, shared, langs: bad }), createMemoryStore()).check({ tags: ['fr'] });
    expect(ok.status).toBe('updated');
  });
});

describe('13/14. the publish script', () => {
  const keyPair = () => {
    const k = run('updates-keygen.mjs', []).split('\n');
    return { secret: k[0]!.split(': ')[1]!.trim(), pub: k[1]!.split(': ')[1]!.trim() };
  };
  const tree = (files: Record<string, string>) => {
    const src = mkdtempSync(join(tmpdir(), 'src3-'));
    for (const [p, c] of Object.entries(files)) {
      mkdirSync(dirname(join(src, p)), { recursive: true });
      writeFileSync(join(src, p), c);
    }
    return src;
  };
  const valid = (): Record<string, string> => ({
    'packs/index.json': '{"packs":["xzz","fr"]}',
    'packs/xzz/manifest.json': manifestJson('xzz', { voice: { kind: 'recorded' } }),
    'packs/xzz/phrases.json': phrasesJson('x'),
    'packs/xzz/audio/index.json': JSON.stringify({ clips: [{ id: 'num.1', file: 'num.1.m4a' }, 'currency.XAF'] }),
    'packs/xzz/audio/num.1.m4a': 'a',
    'packs/xzz/audio/currency.XAF.webm': 'b',
    'packs/fr/manifest.json': manifestJson('fr'),
    'packs/fr/phrases.json': phrasesJson('fr'),
    'regions/CM/region.json': REGION,
  });
  const publish = (src: string, extra: string[] = []) => {
    const { secret, pub } = keyPair();
    const out = mkdtempSync(join(tmpdir(), 'out3-'));
    const log = run('updates-publish.mjs', ['--src', src, '--out', out, ...extra], { UPDATE_SIGNING_KEY: secret });
    return { out, pub, secret, log };
  };
  const dirFetch = (dir: string): FetchFn => async (url) => {
    const p = join(dir, url.replace(`${BASE}/`, ''));
    return existsSync(p) ? new Response(readFileSync(p)) : new Response('', { status: 404 });
  };

  it('publishes upper-case clips and .m4a clips (the real allow-list is used)', () => {
    const { out } = publish(tree(valid()));
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    expect(index.files.map((f: { path: string }) => f.path)).toContain('packs/xzz/audio/currency.XAF.webm');
    expect(index.files.map((f: { path: string }) => f.path)).toContain('packs/xzz/audio/num.1.m4a');
    for (const f of index.files) expect(isAllowedPath(f.path), f.path).toBe(true);
  });
  it('refuses to publish a file the app would refuse, naming it', () => {
    const files = valid();
    files['packs/xzz/rules.json'] = JSON.stringify({ formatVersion: 1, numbers: { atoms: { 0: 'a' } } });
    const msg = runFail('updates-publish.mjs', ['--src', tree(files), '--out', mkdtempSync(join(tmpdir(), 'o-'))], { UPDATE_SIGNING_KEY: keyPair().secret });
    expect(msg).toMatch(/refusing to publish/);
    expect(msg).toMatch(/packs\/xzz\/rules\.json: .*atoms is missing "1"/);
  });
  it('refuses recorder-notes.json inside packs/', () => {
    const files = { ...valid(), 'packs/xzz/recorder-notes.json': '{"speakers":[{"name":"Ama"}]}' };
    const msg = runFail('updates-publish.mjs', ['--src', tree(files), '--out', mkdtempSync(join(tmpdir(), 'o-'))], { UPDATE_SIGNING_KEY: keyPair().secret });
    expect(msg).toMatch(/packs\/xzz\/recorder-notes\.json must not be in a pack/);
  });
  it('refuses a pack whose audio index and clip files do not match', () => {
    const missing = { ...valid() };
    delete missing['packs/xzz/audio/num.1.m4a'];
    expect(runFail('updates-publish.mjs', ['--src', tree(missing), '--out', mkdtempSync(join(tmpdir(), 'o-'))], { UPDATE_SIGNING_KEY: keyPair().secret })).toMatch(/lists num\.1\.m4a, which is not in the pack/);
    const extra = { ...valid(), 'packs/xzz/audio/num.2.webm': 'z' };
    expect(runFail('updates-publish.mjs', ['--src', tree(extra), '--out', mkdtempSync(join(tmpdir(), 'o-'))], { UPDATE_SIGNING_KEY: keyPair().secret })).toMatch(/num\.2\.webm is not listed in packs\/xzz\/audio\/index\.json/);
  });
  it('voices are published only when asked for', () => {
    const files = { ...valid(), 'packs/fr/voice/fr_FR-x-low.onnx': 'model', 'packs/fr/voice/fr_FR-x-low.onnx.json': JSON.stringify({ audio: { sample_rate: 22050 }, espeak: { voice: 'fr' }, inference: {}, phoneme_id_map: { a: [1] } }) };
    const a = publish(tree(files));
    expect(a.log).toContain('Voice models are published only with --voices');
    expect(readdirSync(join(a.out, 'packs/fr'))).not.toContain('voice');
    const b = publish(tree(files), ['--voices', 'fr']);
    expect(readdirSync(join(b.out, 'packs/fr/voice')).sort()).toEqual(['fr_FR-x-low.onnx', 'fr_FR-x-low.onnx.json']);
  });
  it('--per-language writes a signed index with per-language lists that the client installs selectively', async () => {
    const src = tree(valid());
    const { out, pub, log } = publish(src, ['--per-language']);
    expect(log).toContain('in 2 language lists');
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    expect(index.files.map((f: { path: string }) => f.path)).toEqual(['packs/index.json', 'regions/CM/region.json']);
    expect(Object.keys(index.languages)).toEqual(['fr', 'xzz']);
    expect(index.languages.xzz.version).toBe('0.1.0');
    const store = createMemoryStore();
    const client = createUpdateClient({ baseUrl: BASE, publicKeyBase64: pub, store, fetch: dirFetch(out) });
    const r = await client.check({ tags: ['xzz'] });
    expect(r).toMatchObject({ status: 'updated', languages: ['xzz'] });
    expect(await store.hasFile('packs/xzz/audio/currency.XAF.webm')).toBe(true);
    expect(await store.hasFile('packs/fr/phrases.json')).toBe(false);
    const overlay = createOverlayFetch(store, async () => new Response('bundled'));
    expect((await (await overlay('./packs/xzz/phrases.json')).text())).toBe(phrasesJson('x'));
  });
});

describe('1/3/5/6. scripts/check-packs.mjs enforces statuses, the audio index and privacy', () => {
  const frRules = read('packs/fr/rules.json');
  const check = (packs: Record<string, Record<string, string>>): { code: number; out: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'packs3-'));
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ packs: Object.keys(packs) }));
    for (const [tag, files] of Object.entries(packs)) {
      for (const [f, c] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, tag, f)), { recursive: true });
        writeFileSync(join(dir, tag, f), c);
      }
    }
    try {
      return { code: 0, out: run('check-packs.mjs', ['--packs', dir]) };
    } catch (e) {
      const x = e as { status?: number; stdout?: string; stderr?: string };
      return { code: x.status ?? 1, out: `${x.stdout ?? ''}${x.stderr ?? ''}` };
    }
  };
  const man = (tag: string, over: Record<string, unknown> = {}) => manifestJson(tag, { voice: { kind: 'recorded' }, status: 'in_recording', license: 'LicenseRef-community-decides', ...over });
  const empty = (tag: string, over: Record<string, unknown> = {}): Record<string, string> => ({ 'manifest.json': man(tag, over), 'phrases.json': '{}', 'audio/index.json': '{"clips":[]}' });

  it('passes the real packs (the empty community packs stay in_recording)', () => {
    const out = run('check-packs.mjs', []);
    expect(out).toContain('OK: all packs pass.');
    expect(out).toMatch(/lmp\s+Limbum\s+in_recording/);
  });
  it('rejects recorder-notes.json inside a pack, and the guard script says the same', () => {
    const r = check({ xzz: { ...empty('xzz'), 'recorder-notes.json': '{"speakers":[{"name":"Ama"}]}' } });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/packs\/xzz\/recorder-notes\.json must not be in a pack/);
    const dir = mkdtempSync(join(tmpdir(), 'guard3-'));
    mkdirSync(join(dir, 'xzz'));
    writeFileSync(join(dir, 'xzz', 'recorder-notes.json'), '{}');
    expect(runFail('guard-packs.mjs', [dir])).toMatch(/recorder-notes\.json must not be in a pack/);
    expect(run('guard-packs.mjs', [join(repo, 'packs')])).toContain('OK');
  });
  it('the warning for a missing rules.json says what really happens', () => {
    const r = check({ xzz: empty('xzz') });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/rules\.json is missing: the pack is read as having no rules, so every phrase with \{amount\}, \{date\} or \{phone\} is spoken in the next fallback language/);
    const beta = check({ xzz: { ...empty('xzz', { status: 'beta', license: 'CC-BY-4.0' }) } });
    expect(beta.out).toMatch(/rules\.json is required for beta packs/);
  });
  it('audio/index.json and the clip files must match one to one; only .webm and .m4a', () => {
    const files = (over: Record<string, string>) => ({ ...empty('xzz'), 'rules.json': frRules, ...over });
    const ok = check({ xzz: files({ 'audio/index.json': JSON.stringify({ clips: [{ id: 'num.1', file: 'num.1.m4a' }, 'num.2'] }), 'audio/num.1.m4a': 'a', 'audio/num.2.webm': 'b' }) });
    expect(ok.code).toBe(0);
    const unlisted = check({ xzz: files({ 'audio/num.1.webm': 'a' }) });
    expect(unlisted.out).toMatch(/audio\/num\.1\.webm is not in audio\/index\.json/);
    const missing = check({ xzz: files({ 'audio/index.json': JSON.stringify({ clips: [{ id: 'num.1', file: 'num.1.m4a' }] }) }) });
    expect(missing.out).toMatch(/lists num\.1\.m4a \(clip "num\.1"\) but audio\/num\.1\.m4a does not exist/);
    const wrongExt = check({ xzz: files({ 'audio/index.json': JSON.stringify({ clips: [{ id: 'num.1', file: 'num.1.wav' }] }), 'audio/num.1.wav': 'a' }) });
    expect(wrongExt.out).toMatch(/only \.webm and \.m4a clips are allowed/);
    expect(wrongExt.out).toMatch(/must be "num\.1\.webm" or "num\.1\.m4a"/);
    const noIndex = check({ xzz: { 'manifest.json': man('xzz'), 'phrases.json': '{}', 'rules.json': frRules } });
    expect(noIndex.out).toMatch(/audio\/index\.json is missing/);
  });
  it('a beta pack needs a real SPDX licence', () => {
    const r = check({ xzz: { ...empty('xzz', { status: 'beta' }), 'rules.json': frRules } });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/a beta pack needs a real SPDX licence .*"LicenseRef-community-decides"/);
    expect(check({ xzz: { ...empty('xzz', { status: 'beta', license: 'CC-BY-SA-4.0' }), 'rules.json': frRules } }).code).toBe(0);
  });
  it('a stable pack needs every key reviewed with audio (recorded) or text (tts), a licence, a contributor and no stale clips', async () => {
    const { CATALOG } = await import('../../core/src/catalog.js');
    const { requiredClips } = await import('@sabitori/speech');
    const keys = Object.keys(CATALOG) as (keyof typeof CATALOG)[];
    const phrases: Record<string, unknown> = {};
    const files: Record<string, string> = {};
    const idx: string[] = [];
    for (const k of keys) {
      const slots = ((CATALOG[k] as { slots?: readonly string[] }).slots ?? []) as string[];
      phrases[k] = { text: `x ${slots.map((s) => `{${s}}`).join(' ')}`.trim(), status: 'reviewed', audio: [{ clip: `${k}.0` }, ...slots.map((s) => ({ slot: s }))] };
      files[`audio/${k}.0.webm`] = 'a';
      idx.push(`${k}.0`);
    }
    const manifest = JSON.parse(man('xzz', { status: 'stable', license: 'CC-BY-SA-4.0', contributors: [{ name: 'Ama N.', role: 'speaker' }] }));
    const pack = { manifest, phrases, rules: JSON.parse(frRules) };
    for (const id of requiredClips(pack as never, { region: JSON.parse(read('regions/CM/region.json')) })) if (!idx.includes(id)) { files[`audio/${id}.webm`] = 'a'; idx.push(id); }
    const full = (over: Record<string, string> = {}) => ({ 'manifest.json': JSON.stringify(manifest), 'phrases.json': JSON.stringify(phrases), 'rules.json': frRules, 'audio/index.json': JSON.stringify({ clips: idx }), ...files, ...over });
    const good = check({ xzz: full() });
    expect(good.out).not.toMatch(/Errors/);
    expect(good.code).toBe(0);

    const draft = { ...phrases, 'scam.likely': { ...(phrases['scam.likely'] as object), status: 'draft' } };
    const a = check({ xzz: full({ 'phrases.json': JSON.stringify(draft) }) });
    expect(a.out).toMatch(/a stable pack needs every catalog key reviewed with audio; 1 are not: scam\.likely \(not reviewed\)/);

    const { 'audio': _drop, ...noAudio } = phrases['scam.caution'] as { audio: unknown };
    void _drop;
    const b = check({ xzz: full({ 'phrases.json': JSON.stringify({ ...phrases, 'scam.caution': noAudio }) }) });
    expect(b.out).toMatch(/scam\.caution \(no audio\)/);

    const c = check({ xzz: full({ 'manifest.json': JSON.stringify({ ...manifest, contributors: [], license: 'LicenseRef-community-decides' }) }) });
    expect(c.out).toMatch(/a stable pack needs a real SPDX licence/);
    expect(c.out).toMatch(/needs at least one contributor/);

    const d = check({ xzz: full({ 'audio/stale.1.webm': 'a', 'audio/index.json': JSON.stringify({ clips: [...idx, 'stale.1'] }) }) });
    expect(d.out).toMatch(/1 clip\(s\) are not used by any phrase or rule \(stale\): stale\.1/);
    expect(d.code).toBe(1);

    const e2 = check({ xzz: full({ 'audio/index.json': JSON.stringify({ clips: idx.filter((i) => i !== 'scam.likely.0') }) }) });
    expect(e2.out).toMatch(/scam\.likely\.0\.webm is not in audio\/index\.json/);
    expect(e2.code).toBe(1);

    // a tts pack is stable with reviewed text alone
    const tts = { 'manifest.json': manifestJson('xzz', { status: 'stable', license: 'CC-BY-4.0', contributors: [{ name: 'Ama N.', role: 'translator' }] }), 'phrases.json': JSON.stringify(Object.fromEntries(Object.entries(phrases).map(([k, v]) => [k, { text: (v as { text: string }).text, status: 'reviewed' }]))), 'rules.json': frRules };
    expect(check({ xzz: tts }).code).toBe(0);
  });
});
