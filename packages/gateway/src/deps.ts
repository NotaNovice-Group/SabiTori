import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReadingLexicon, RegionConfig } from '@sabitori/core';
import { createPackRegistry } from '@sabitori/speech';
import type { ReplyDeps } from './reply.js';

/** Region, reading lexicons and language packs read from a SabiTori checkout (the same files the app ships). */
export function createDiskDeps(root: string, today: () => string = () => new Date().toISOString().slice(0, 10)): () => ReplyDeps {
  const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
  const region = json('regions/CM/region.json') as RegionConfig;
  const lexicons = ['fr', 'en'].map((t) => json(`packs/${t}/reading.json`)) as ReadingLexicon[];
  const registry = createPackRegistry({
    baseUrl: '/packs',
    fetch: async (url: string) => {
      const file = resolve(root, url.replace(/^\//, ''));
      if (!existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
    },
  });
  return () => ({ region, lexicons, registry, today: today() });
}
