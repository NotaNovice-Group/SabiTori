#!/usr/bin/env node
/**
 * Checks every language pack listed in packs/index.json against the phrase
 * catalog (packages/core/src/catalog.ts) and the PackManifest / PhraseEntry
 * types (packages/core/src/pack.ts). Prints a coverage table.
 *
 * Also validates rules.json with the speech package's validateRules (stable and beta packs must have
 * one; in_recording packs get a warning) and requires reading.json for packs with reads: true.
 *
 * Status is enforced (see packs/README.md):
 *   stable  every catalog key reviewed, with audio (recorded packs) or text (tts packs); a real SPDX licence;
 *           at least one contributor; no stale clips; every clip a phrase uses is in audio/index.json
 *   beta    a real SPDX licence, rules.json
 *   all     audio/index.json and the clip files match one to one, only .webm and .m4a clips,
 *           no recorder-notes.json (it lists speakers and review notes)
 *
 * Exit code 0 when there are no errors, 1 otherwise. Warnings never fail.
 *   node scripts/check-packs.mjs [--packs <dir>]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CATALOG } from '../packages/core/src/catalog.ts';
import { findForbiddenPackFiles, forbiddenMessage } from './lib/guard.mjs';
import { importTs, root } from './lib/ts.mjs';

// The validators are the speech package's own (TypeScript): the same code the app runs when it loads a pack.
const { validateRules, rulesWarnings, parseAudioIndex, CLIP_EXTENSIONS } = await importTs('packages/speech/src/contract.ts');
const { requiredClips } = await importTs('packages/speech/src/required.ts');
// `--packs <dir>` checks another directory (tests, a pack under review) instead of packs/.
const argIdx = process.argv.indexOf('--packs');
const packsDir = argIdx >= 0 && process.argv[argIdx + 1] ? resolve(process.argv[argIdx + 1]) : join(root, 'packs');

const PACK_STATUS = ['stable', 'beta', 'in_recording', 'planned'];
const PHRASE_STATUS = ['draft', 'reviewed'];
const CONTRIB_ROLES = ['translator', 'speaker', 'reviewer', 'maintainer'];
const LANG_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
/** SPDX identifiers a community may choose (and the project uses). `LicenseRef-community-decides` is the placeholder, not a licence. */
const SPDX = new Set([
  'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-ND-4.0',
  'CC-BY-3.0', 'CC-BY-SA-3.0', 'MIT', 'Apache-2.0', 'MPL-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense',
  'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'ODbL-1.0', 'ODC-By-1.0', 'PDDL-1.0',
]);
const isRealLicense = (l) => typeof l === 'string' && SPDX.has(l);

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
  if (!LANG_TAG.test(String(m.tag))) err(tag, `manifest.tag "${m.tag}" is not a valid language tag`);
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
      if (!LANG_TAG.test(f)) err(tag, `fallback "${f}" is not a valid language tag`);
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

function checkPhrases(tag, phrases, declaredClips, status) {
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
          else if (!declaredClips.has(part.clip)) {
            // The registry treats a clip that audio/index.json does not list as missing: the phrase falls back to another language.
            const msg = `${key}: clip "${part.clip}" is not in audio/index.json (with its file), so the phrase falls back to another language`;
            if (status === 'stable') err(tag, msg);
            else warn(tag, msg);
          }
        } else {
          err(tag, `${key}: audio part must be {clip} or {slot}`);
        }
      }
    }
  }
}

function checkRules(tag, manifest, dir) {
  const path = join(dir, 'rules.json');
  const status = manifest?.status;
  if (!existsSync(path)) {
    if (status === 'stable' || status === 'beta') err(tag, `rules.json is required for ${status} packs`);
    else warn(tag, `rules.json is missing: the pack is read as having no rules, so every phrase with {amount}, {date} or {phone} is spoken in the next fallback language (allowed while status is ${status ?? 'unknown'}; a Recorder export always includes a minimal rules.json)`);
    return;
  }
  const rules = readJson(path, tag);
  if (rules === undefined) return;
  try {
    validateRules(rules, tag);
  } catch (e) {
    return err(tag, e.message);
  }
  for (const w of rulesWarnings(rules)) warn(tag, `rules.json: ${w}`);
}

function checkReading(tag, manifest, dir) {
  const path = join(dir, 'reading.json');
  if (!existsSync(path)) {
    if (manifest?.reads === true) err(tag, 'reads is true, so reading.json is required (12 month lists, 7 weekday lists)');
    return;
  }
  const r = readJson(path, tag);
  if (r === undefined) return;
  if (!isObj(r)) return err(tag, 'reading.json is not an object');
  if (r.formatVersion !== 1) err(tag, 'reading.json formatVersion must be 1');
  if (r.tag !== tag) err(tag, `reading.json tag "${r.tag}" does not match folder "${tag}"`);
  const lists = (name, n) => {
    const v = r[name];
    if (!Array.isArray(v) || v.length !== n) return err(tag, `reading.json ${name} must be ${n} lists`);
    v.forEach((l, i) => {
      if (!Array.isArray(l) || l.length === 0 || !l.every(isStr)) err(tag, `reading.json ${name}[${i}] must be a non-empty list of non-empty strings`);
    });
  };
  lists('months', 12);
  lists('weekdays', 7);
}

/**
 * audio/: clip files are .webm or .m4a only, and audio/index.json lists exactly the clips that have a file, each
 * with the file name (`{"id","file"}`; a plain string means <id>.webm). The registry refuses a recorded pack
 * without the index, and plays only what the index lists.
 */
function checkAudio(tag, manifest, dir) {
  const result = { files: new Set(), indexed: new Set(), map: new Map(), ok: false };
  const audioDir = join(dir, 'audio');
  const recorded = manifest?.voice?.kind === 'recorded';
  const names = existsSync(audioDir) ? readdirSync(audioDir) : [];
  const exts = CLIP_EXTENSIONS.map((e) => `.${e}`);
  for (const f of names) {
    if (f === 'index.json') continue;
    if (!exts.some((e) => f.endsWith(e))) err(tag, `audio/${f}: only .webm and .m4a clips are allowed`);
    else result.files.add(f);
  }
  const indexPath = join(audioDir, 'index.json');
  if (!existsSync(indexPath)) {
    if (recorded) err(tag, 'audio/index.json is missing: a recorded pack must list its clips there ({"clips":[{"id":"num.1","file":"num.1.webm"}]})');
    else if (result.files.size) err(tag, 'audio/ has clips but no audio/index.json');
    return result;
  }
  const idx = readJson(indexPath, tag);
  if (idx === undefined) return result;
  let map;
  try {
    map = parseAudioIndex(idx, tag);
  } catch (e) {
    err(tag, e.message);
    return result;
  }
  result.map = map;
  result.ok = true;
  for (const [id, file] of map) {
    if (result.files.has(file)) result.indexed.add(id);
    else err(tag, `audio/index.json lists ${file} (clip "${id}") but audio/${file} does not exist`);
  }
  const listed = new Set(map.values());
  for (const f of result.files) if (!listed.has(f)) err(tag, `audio/${f} is not in audio/index.json (a clip the index does not list is never played)`);
  return result;
}

/** What each status promises (see packs/README.md). */
function checkStatus(tag, manifest, phrases, audio, dir) {
  const status = manifest.status;
  const recorded = manifest.voice?.kind === 'recorded';
  if (status === 'stable' || status === 'beta') {
    if (!isRealLicense(manifest.license)) err(tag, `a ${status} pack needs a real SPDX licence (such as CC-BY-SA-4.0), not "${manifest.license}"`);
  }
  if (recorded && audio.ok) {
    // Clips that nothing plays: not in any phrase and not needed by the rules.
    let rules;
    try {
      rules = existsSync(join(dir, 'rules.json')) ? JSON.parse(readFileSync(join(dir, 'rules.json'), 'utf8')) : undefined;
    } catch {
      rules = undefined;
    }
    const used = new Set();
    for (const e of Object.values(phrases)) for (const a of Array.isArray(e?.audio) ? e.audio : []) if (isObj(a) && isStr(a.clip)) used.add(a.clip);
    if (rules) {
      let region;
      try {
        region = JSON.parse(readFileSync(join(root, 'regions', manifest.regions?.[0] ?? 'CM', 'region.json'), 'utf8'));
      } catch {
        region = undefined;
      }
      try {
        for (const id of requiredClips({ manifest, phrases, rules }, region ? { region } : undefined)) used.add(id);
      } catch {
        /* rules errors are reported by checkRules */
      }
    }
    const stale = [...audio.indexed].filter((id) => !used.has(id));
    if (stale.length) {
      const msg = `${stale.length} clip(s) are not used by any phrase or rule (stale): ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ' ...' : ''}`;
      if (status === 'stable') err(tag, msg);
      else warn(tag, msg);
    }
    const drafts = Object.values(phrases).filter((e) => e?.status === 'draft').length;
    if (drafts && status !== 'in_recording') warn(tag, `${drafts} phrase(s) are still "draft": a recorded pack does not speak drafts, those phrases fall back to another language`);
  }
  if (status === 'stable') {
    if (!Array.isArray(manifest.contributors) || manifest.contributors.length === 0) err(tag, 'a stable pack needs at least one contributor in manifest.contributors (consented names)');
    const missing = [];
    for (const key of Object.keys(CATALOG)) {
      const e = phrases[key];
      if (!isObj(e) || !isStr(e.text)) missing.push(`${key} (no text)`);
      else if (e.status !== 'reviewed') missing.push(`${key} (not reviewed)`);
      else if (recorded && !(Array.isArray(e.audio) && e.audio.length > 0)) missing.push(`${key} (no audio)`);
    }
    if (missing.length) err(tag, `a stable pack needs every catalog key reviewed${recorded ? ' with audio' : ' with text'}; ${missing.length} are not: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' ...' : ''}`);
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

// Working files of the Recorder must never be in a pack (they list speakers and review notes).
for (const f of findForbiddenPackFiles(packsDir)) err(f.split('/')[0], forbiddenMessage(`packs/${f}`));

const total = Object.keys(CATALOG).length;
const rows = [];

for (const tag of listed) {
  const dir = join(packsDir, tag);
  if (!existsSync(dir)) { err(tag, `listed in index.json but packs/${tag}/ does not exist`); continue; }

  const manifest = readJson(join(dir, 'manifest.json'), tag);
  if (manifest) checkManifest(tag, manifest, listed);

  checkRules(tag, manifest, dir);
  checkReading(tag, manifest, dir);

  const audio = checkAudio(tag, manifest, dir);

  const phrases = readJson(join(dir, 'phrases.json'), tag);
  if (phrases) checkPhrases(tag, phrases, audio.indexed, manifest?.status);

  const translated = isObj(phrases) ? Object.keys(phrases).filter((k) => k in CATALOG) : [];
  const reviewed = translated.filter((k) => phrases[k]?.status === 'reviewed').length;
  const withAudio = translated.filter((k) => Array.isArray(phrases[k]?.audio)).length;
  if (isObj(phrases) && manifest) checkStatus(tag, manifest, phrases, audio, dir);
  rows.push({
    tag,
    name: manifest?.name ?? '?',
    status: manifest?.status ?? '?',
    keys: `${translated.length}/${total}`,
    reviewed: `${reviewed}/${total}`,
    audioPhrases: manifest?.voice?.kind === 'recorded' ? `${withAudio}/${total}` : 'n/a (tts)',
    clips: audio.files.size,
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
