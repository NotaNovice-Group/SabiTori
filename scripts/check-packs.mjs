#!/usr/bin/env node
/**
 * Checks every language pack listed in packs/index.json against the phrase
 * catalog (packages/core/src/catalog.ts) and the PackManifest / PhraseEntry
 * types (packages/core/src/pack.ts). Prints a coverage table.
 *
 * Exit code 0 when there are no errors, 1 otherwise. Warnings never fail.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { CATALOG } from '../packages/core/src/catalog.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = join(root, 'packs');

const PACK_STATUS = ['stable', 'beta', 'in_recording', 'planned'];
const PHRASE_STATUS = ['draft', 'reviewed'];
const CONTRIB_ROLES = ['translator', 'speaker', 'reviewer', 'maintainer'];
const CLIP_EXT = /\.(webm|opus|m4a|ogg|wav|mp3)$/i;

const errors = [];
const warnings = [];
const err = (tag, msg) => errors.push(`[${tag}] ${msg}`);
const warn = (tag, msg) => warnings.push(`[${tag}] ${msg}`);

const readJson = (path, tag) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    err(tag, `cannot read ${path}: ${e.message}`);
    return undefined;
  }
};

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Slot names written as {name} in a sentence. */
const slotsIn = (text) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

function checkManifest(tag, m, listedTags) {
  if (!isObj(m)) return err(tag, 'manifest.json is not an object');
  if (m.formatVersion !== 1) err(tag, `formatVersion must be 1, got ${JSON.stringify(m.formatVersion)}`);
  if (m.tag !== tag) err(tag, `manifest tag "${m.tag}" does not match folder "${tag}"`);
  for (const k of ['name', 'autonym', 'script', 'license', 'version']) {
    if (!isStr(m[k])) err(tag, `manifest.${k} must be a non-empty string`);
  }
  if (isStr(m.script) && !/^[A-Z][a-z]{3}$/.test(m.script)) err(tag, `manifest.script "${m.script}" is not ISO 15924`);
  if (isStr(m.version) && !/^\d+\.\d+\.\d+$/.test(m.version)) err(tag, `manifest.version "${m.version}" is not semver`);
  if (!['ltr', 'rtl'].includes(m.direction)) err(tag, 'manifest.direction must be ltr or rtl');
  if (!Array.isArray(m.fallback) || !m.fallback.every(isStr)) {
    err(tag, 'manifest.fallback must be an array of tags');
  } else {
    for (const f of m.fallback) {
      if (f === tag) err(tag, 'manifest.fallback lists the pack itself');
      if (!listedTags.includes(f)) warn(tag, `fallback "${f}" is not in packs/index.json`);
    }
  }
  if (typeof m.reads !== 'boolean') err(tag, 'manifest.reads must be a boolean');
  if (!PACK_STATUS.includes(m.status)) err(tag, `manifest.status must be one of ${PACK_STATUS.join(', ')}`);
  if (!Array.isArray(m.regions) || !m.regions.every(isStr)) err(tag, 'manifest.regions must be an array of region codes');
  if (!Array.isArray(m.contributors)) {
    err(tag, 'manifest.contributors must be an array');
  } else {
    for (const c of m.contributors) {
      if (!isObj(c) || !isStr(c.name) || !CONTRIB_ROLES.includes(c.role)) {
        err(tag, `bad contributor entry ${JSON.stringify(c)}`);
      }
    }
  }
  const v = m.voice;
  if (!isObj(v)) {
    err(tag, 'manifest.voice must be an object');
  } else if (v.kind === 'tts') {
    if (!['system', 'piper'].includes(v.engine)) err(tag, 'voice.engine must be system or piper');
    if (!isStr(v.bcp47)) err(tag, 'voice.bcp47 must be a non-empty string');
  } else if (v.kind !== 'recorded') {
    err(tag, 'voice.kind must be tts or recorded');
  }
}

function checkPhrases(tag, phrases, declaredClips) {
  if (!isObj(phrases)) return err(tag, 'phrases.json is not an object');
  for (const [key, entry] of Object.entries(phrases)) {
    if (!(key in CATALOG)) {
      err(tag, `phrase key "${key}" is not in the catalog`);
      continue;
    }
    if (!isObj(entry)) { err(tag, `${key}: entry is not an object`); continue; }
    if (!isStr(entry.text)) err(tag, `${key}: text must be a non-empty string`);
    if (!PHRASE_STATUS.includes(entry.status)) err(tag, `${key}: status must be draft or reviewed`);

    const want = new Set(CATALOG[key].slots ?? []);
    if (isStr(entry.text)) {
      const got = slotsIn(entry.text);
      const missing = [...want].filter((s) => !got.has(s));
      const extra = [...got].filter((s) => !want.has(s));
      if (missing.length) err(tag, `${key}: text is missing slot(s) {${missing.join('}, {')}}`);
      if (extra.length) err(tag, `${key}: text has unknown slot(s) {${extra.join('}, {')}}`);
    }

    if (entry.audio !== undefined) {
      if (!Array.isArray(entry.audio)) { err(tag, `${key}: audio must be an array`); continue; }
      for (const part of entry.audio) {
        if (isObj(part) && 'slot' in part) {
          if (!want.has(part.slot)) err(tag, `${key}: audio refers to undeclared slot "${part.slot}"`);
        } else if (isObj(part) && 'clip' in part) {
          if (!isStr(part.clip)) err(tag, `${key}: audio clip id must be a string`);
          else if (!declaredClips.has(part.clip)) warn(tag, `${key}: clip "${part.clip}" has no file in audio/`);
        } else {
          err(tag, `${key}: audio part must be {clip} or {slot}`);
        }
      }
    }
  }
}

// ---- main -----------------------------------------------------------------

const index = readJson(join(packsDir, 'index.json'), 'index');
const listed = Array.isArray(index?.packs) ? index.packs : [];
if (!Array.isArray(index?.packs)) err('index', 'packs/index.json must be {"packs": [...]}');

const folders = existsSync(packsDir)
  ? readdirSync(packsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const f of folders) {
  if (!listed.includes(f)) err(f, `folder packs/${f} is not listed in packs/index.json`);
}

const total = Object.keys(CATALOG).length;
const rows = [];

for (const tag of listed) {
  const dir = join(packsDir, tag);
  if (!existsSync(dir)) { err(tag, `listed in index.json but packs/${tag}/ does not exist`); continue; }

  const manifest = readJson(join(dir, 'manifest.json'), tag);
  if (manifest) checkManifest(tag, manifest, listed);

  const audioDir = join(dir, 'audio');
  const clipFiles = existsSync(audioDir) ? readdirSync(audioDir).filter((f) => CLIP_EXT.test(f)) : [];
  const declaredClips = new Set(clipFiles.map((f) => f.replace(/\.[^.]+$/, '')));

  const phrases = readJson(join(dir, 'phrases.json'), tag);
  if (phrases) checkPhrases(tag, phrases, declaredClips);

  const translated = isObj(phrases) ? Object.keys(phrases).filter((k) => k in CATALOG) : [];
  const reviewed = translated.filter((k) => phrases[k]?.status === 'reviewed').length;
  const withAudio = translated.filter((k) => Array.isArray(phrases[k]?.audio)).length;
  rows.push({
    tag,
    name: manifest?.name ?? '?',
    status: manifest?.status ?? '?',
    keys: `${translated.length}/${total}`,
    reviewed: `${reviewed}/${total}`,
    audioPhrases: manifest?.voice?.kind === 'recorded' ? `${withAudio}/${total}` : 'n/a (tts)',
    clips: clipFiles.length,
  });
}

// ---- report ---------------------------------------------------------------

const cols = [
  ['pack', 'tag'], ['name', 'name'], ['status', 'status'],
  ['keys translated', 'keys'], ['reviewed', 'reviewed'],
  ['audio phrases', 'audioPhrases'], ['clip files', 'clips'],
];
const width = cols.map(([h, k]) => Math.max(h.length, ...rows.map((r) => String(r[k]).length)));
const line = (cells) => cells.map((c, i) => String(c).padEnd(width[i])).join('  ');
console.log(`Catalog keys: ${total}\n`);
console.log(line(cols.map(([h]) => h)));
console.log(line(width.map((w) => '-'.repeat(w))));
for (const r of rows) console.log(line(cols.map(([, k]) => r[k])));

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  ${w}`);
}
if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  for (const e of errors) console.log(`  ${e}`);
  console.log('\nFAILED');
  process.exit(1);
}
console.log('\nOK: all packs pass.');
