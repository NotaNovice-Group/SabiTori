import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createMemoryStore, createOverlayFetch, createUpdateClient, isAllowedPath, type FetchFn } from '../src/index.js';

const repo = resolve(__dirname, '../../..');
const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync('node', [join(repo, 'scripts', script), ...args], { env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function dirFetch(dir: string): FetchFn {
  return async (url) => {
    const p = join(dir, url.replace('https://cdn.example/sabi/', ''));
    return existsSync(p) ? new Response(readFileSync(p)) : new Response('', { status: 404 });
  };
}

describe('publisher to client round trip', () => {
  it('publishes a signed directory that the client installs and the overlay serves', async () => {
    const keys = run('updates-keygen.mjs', []).split('\n');
    const secret = keys[0]!.split(': ')[1]!.trim();
    const pub = keys[1]!.split(': ')[1]!.trim();
    const out = mkdtempSync(join(tmpdir(), 'upd-'));

    // a small source tree so the test does not depend on the real packs
    const src = mkdtempSync(join(tmpdir(), 'src-'));
    for (const [p, c] of Object.entries({ 'packs/index.json': '{"packs":["fr"]}', 'packs/fr/phrases.json': '{"a":{"text":"un"}}', 'packs/fr/README.md': 'x', 'regions/CM/region.json': '{"code":"CM"}', 'packs/fr/notes.txt': 'x' })) {
      mkdirSync(join(src, p, '..'), { recursive: true });
      writeFileSync(join(src, p), c);
    }
    const log = run('updates-publish.mjs', ['--src', src, '--out', out], { UPDATE_SIGNING_KEY: secret });
    expect(log).toContain('Published sequence 1');
    expect(log).toContain(pub);

    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    expect(index.files.map((f: { path: string }) => f.path)).toEqual(['packs/fr/phrases.json', 'packs/index.json', 'regions/CM/region.json']);
    for (const f of index.files) expect(isAllowedPath(f.path)).toBe(true);

    const store = createMemoryStore();
    const client = createUpdateClient({ baseUrl: 'https://cdn.example/sabi', publicKeyBase64: pub, store, fetch: dirFetch(out) });
    expect(await client.check()).toMatchObject({ status: 'updated', sequence: 1 });
    const overlay = createOverlayFetch(store, async () => new Response('bundled'));
    expect(await (await overlay('./packs/fr/phrases.json')).json()).toEqual({ a: { text: 'un' } });

    // next publish increments from --previous
    const out2 = mkdtempSync(join(tmpdir(), 'upd-'));
    run('updates-publish.mjs', ['--src', src, '--out', out2, '--previous', join(out, 'index.json')], { UPDATE_SIGNING_KEY: secret });
    expect(JSON.parse(readFileSync(join(out2, 'index.json'), 'utf8')).sequence).toBe(2);
    const client2 = createUpdateClient({ baseUrl: 'https://cdn.example/sabi', publicKeyBase64: pub, store, fetch: dirFetch(out2) });
    expect(await client2.check()).toMatchObject({ status: 'updated', sequence: 2, changed: [] });

    // a different key's signature is refused
    const other = run('updates-keygen.mjs', []).split('\n')[1]!.split(': ')[1]!.trim();
    const bad = createUpdateClient({ baseUrl: 'https://cdn.example/sabi', publicKeyBase64: other, store: createMemoryStore(), fetch: dirFetch(out) });
    expect(await bad.check()).toMatchObject({ status: 'failed', reason: 'bad_signature' });
  });

  it('publishes the real repo packs and regions with only valid paths', () => {
    const out = mkdtempSync(join(tmpdir(), 'upd-'));
    const secret = run('updates-keygen.mjs', []).split('\n')[0]!.split(': ')[1]!.trim();
    run('updates-publish.mjs', ['--out', out], { UPDATE_SIGNING_KEY: secret });
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    expect(index.files.length).toBeGreaterThan(5);
    for (const f of index.files) expect(isAllowedPath(f.path), f.path).toBe(true);
  });
});
