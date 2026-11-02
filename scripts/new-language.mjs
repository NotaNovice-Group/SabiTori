#!/usr/bin/env node
/**
 * Add a new language to SabiTori in one command.
 *
 *   node scripts/new-language.mjs --tag lns --name "Lamnso'" --autonym "Lamnsoʼ" \
 *     --fallback wes,en,fr --region CM
 *
 * Creates packs/<tag>/ (manifest, empty phrases, minimal rules, empty audio index), lists it in
 * packs/index.json and in regions/<REGION>/region.json. The pack starts as
 * "in_recording": the app offers it with its fallback voice until native speakers
 * translate and record it with the Recorder app (apps/recorder).
 *
 * --tag is an ISO 639-3 code (look it up at https://www.ethnologue.com or
 * https://iso639-3.sil.org). Never invent one.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);

const fail = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

const tag = args.tag?.trim();
const name = args.name?.trim();
const autonym = (args.autonym ?? args.name)?.trim();
const region = (args.region ?? 'CM').trim();
const fallback = (args.fallback ?? 'en,fr').split(',').map((s) => s.trim()).filter(Boolean);

if (!tag || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag)) fail('--tag must be an ISO 639 code such as "lns"');
if (!name) fail('--name is required (the English name, e.g. "Limbum")');
if (fallback.includes(tag)) fail('--fallback cannot contain the language itself');
for (const f of fallback) if (!existsSync(join(root, 'packs', f, 'manifest.json'))) fail(`fallback "${f}" has no pack`);
const regionFile = join(root, 'regions', region, 'region.json');
if (!existsSync(regionFile)) fail(`no region file at regions/${region}/region.json`);

const dir = join(root, 'packs', tag);
if (existsSync(join(dir, 'manifest.json'))) fail(`packs/${tag} already exists`);
mkdirSync(join(dir, 'audio'), { recursive: true });

const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
write(join(dir, 'manifest.json'), {
  formatVersion: 1,
  tag,
  name,
  autonym,
  script: 'Latn',
  direction: 'ltr',
  fallback,
  voice: { kind: 'recorded' },
  reads: false,
  status: 'in_recording',
  regions: [region],
  license: 'LicenseRef-community-decides',
  contributors: [],
  version: '0.1.0',
});
write(join(dir, 'phrases.json'), {});
write(join(dir, 'audio', 'index.json'), { clips: [] });
// A minimal valid rules.json: the digits 0-9 (the least a pack must define) and nothing else. Phrases that need
// numbers, money, dates or phone numbers are spoken in the fallback language until the speakers write the real
// rules (the Recorder's Numbers page). Same file the Recorder exports.
write(join(dir, 'rules.json'), { formatVersion: 1, numbers: { atoms: Object.fromEntries([...'0123456789'].map((d) => [d, d])) } });

const indexFile = join(root, 'packs', 'index.json');
const index = JSON.parse(readFileSync(indexFile, 'utf8'));
if (!index.packs.includes(tag)) index.packs.push(tag);
write(indexFile, index);

const reg = JSON.parse(readFileSync(regionFile, 'utf8'));
if (!reg.languages.includes(tag)) reg.languages.push(tag);
write(regionFile, reg);

console.log(`Added ${name} (${tag}) to packs/ and regions/${region}.`);
console.log('Next: native speakers translate and record it with the Recorder app, then drop the exported zip into packs/' + tag + '/.');
