import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LanguagePack, PackManifest, PackPhrases, PackRules, RegionConfig } from '@sabitori/core';
import { assemble, numberTokens } from '../src/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const loadRules = (tag: string): PackRules => JSON.parse(readFileSync(`${root}packs/${tag}/rules.json`, 'utf8'));
export const frRules = loadRules('fr');
export const enRules = loadRules('en');
export const sayFr = (n: number): string => assemble(numberTokens(frRules.numbers, n));
export const sayEn = (n: number): string => assemble(numberTokens(enRules.numbers, n));

export const region: RegionConfig = {
  formatVersion: 1,
  code: 'CM',
  name: 'Cameroon',
  timezone: 'Africa/Douala',
  currency: { code: 'XAF', aliases: [] },
  phone: { countryCode: '237', nationalPattern: '[62]\\d{8}' },
  languages: ['fr', 'en'],
  officialSenders: [
    { id: 'mtn-momo', displayName: 'MTN MoMo', aliases: [], kind: 'mobile_money', smsSenderIds: [], shortCodes: [], verified: false },
  ],
};

export function manifest(tag: string, voice: PackManifest['voice'], fallback: string[] = []): PackManifest {
  return {
    formatVersion: 1, tag, name: tag, autonym: tag, script: 'Latn', direction: 'ltr', fallback, voice,
    reads: false, status: 'beta', regions: ['CM'], license: 'CC0-1.0', contributors: [], version: '0.0.1',
  };
}

export function ttsPack(tag: string, bcp47: string, rules: PackRules, phrases: PackPhrases, fallback: string[] = []): LanguagePack {
  return { manifest: manifest(tag, { kind: 'tts', engine: 'system', bcp47 }, fallback), phrases, rules };
}
