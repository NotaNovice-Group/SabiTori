import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMemoryStore, createOverlayFetch } from '@sabitori/connect';
import { createEngine } from '../src/engine/packages-engine';

const root = resolve(__dirname, '../../..');
const disk = async (url: string) => {
  const f = resolve(root, url.replace(/^\.?\//, ''));
  return existsSync(f) ? new Response(readFileSync(f)) : new Response('', { status: 404 });
};

describe('engine over the update overlay', () => {
  it('uses an updated region.json and falls back to bundled files for the rest', async () => {
    const region = JSON.parse(readFileSync(resolve(root, 'regions/CM/region.json'), 'utf8'));
    region.languages = ['en', 'fr'];
    const store = createMemoryStore();
    const bytes = new TextEncoder().encode(JSON.stringify(region));
    await store.stage('regions/CM/region.json', bytes);
    await store.commit({ sequence: 1, updatedAt: '', files: { 'regions/CM/region.json': { sha256: 'x', size: bytes.length } } });
    const asked: string[] = [];
    const overlay = createOverlayFetch(store, (u) => (asked.push(u), disk(u)));
    const engine = await createEngine('./', 'CM', { fetch: (u) => overlay(u), resolveClip: async () => null });
    expect((await engine.languages()).map((l) => l.tag)).toEqual(['en', 'fr']);
    expect(asked.some((u) => u.includes('regions/CM'))).toBe(false);
    expect(asked.some((u) => u.includes('packs/fr/manifest.json'))).toBe(true);
  });
});
