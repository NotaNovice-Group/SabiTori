/** Reference material read from the repo at build time: French text and the packs that exist. */
import type { PackManifest } from '@sabitori/core';

const fr = import.meta.glob('../../../../packs/fr/phrases.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, { text: string }>
>;
const manifests = import.meta.glob('../../../../packs/*/manifest.json', { eager: true, import: 'default' }) as Record<
  string,
  PackManifest
>;

const frPhrases = Object.values(fr)[0] ?? {};
export const frenchFor = (key: string): string | undefined => frPhrases[key]?.text;
export const knownPacks: PackManifest[] = Object.values(manifests);
export const knownTags = new Set(knownPacks.map((m) => m.tag));

const enRules = import.meta.glob('../../../../packs/en/rules.json', { eager: true, import: 'default' }) as Record<string, unknown>;
/** English rules.json: a starting structure for numbers and dates, and English hints for each clip. */
export const englishRules = Object.values(enRules)[0] as import('@sabitori/core').PackRules | undefined;
