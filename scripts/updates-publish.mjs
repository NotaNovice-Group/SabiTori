#!/usr/bin/env node
// Builds a signed update directory from packs/ and regions/.
//   UPDATE_SIGNING_KEY=<base64 secret> node scripts/updates-publish.mjs [--previous <index.json path or https URL>]
//        [--out dist-updates] [--sequence N] [--issued-at ISO] [--per-language] [--voices en,lns]
// Upload the whole output directory to any static HTTPS host and set VITE_UPDATE_URL to it.
//
// Every file is judged by the code the app uses (packages/connect: allowed paths and content checks; the speech
// package's validators), and the publish is refused when any file is not one the app can use. Nothing is signed
// that a phone would refuse to install.
//   --per-language  one file list per language (packs/<tag>/index.json, pinned by the signed index) so a phone
//                   downloads only the languages it needs. Use it when the channel grows (hundreds of clips x
//                   many languages). Without it the index lists every file (older apps understand only that).
//   --voices a,b    also publish the Piper voice files (model + config) of these packs. Not published by default:
//                   the bundled voices ship inside the app and a model is tens of megabytes.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { findForbiddenPackFiles, forbiddenMessage } from './lib/guard.mjs';
import { importTs, root } from './lib/ts.mjs';

const { isAllowedPath, maxFileBytes, packTagOf, MAX_TOTAL_BYTES, MAX_FILES } = await importTs('packages/connect/src/paths.ts');
const { validateUpdateFile } = await importTs('packages/connect/src/content.ts');
const { parseAudioIndex } = await importTs('packages/speech/src/contract.ts');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);
const fail = (m) => {
  console.error(`error: ${m}`);
  process.exit(1);
};

const src = resolve(opt('src') ?? root);
const out = resolve(opt('out') ?? join(root, 'dist-updates'));
const perLanguage = flag('per-language');
const voiceTags = new Set((opt('voices') ?? '').split(',').map((s) => s.trim()).filter(Boolean));

const keyB64 = process.env.UPDATE_SIGNING_KEY?.trim();
if (!keyB64) fail('set UPDATE_SIGNING_KEY (base64 secret from scripts/updates-keygen.mjs)');
const seed = Buffer.from(keyB64, 'base64');
if (seed.length !== 32) fail('UPDATE_SIGNING_KEY must be 32 bytes in base64');
const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
const publicKey = createPublicKey(privateKey);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}

const sha = (b) => createHash('sha256').update(b).digest('hex');

// Working files of the Recorder must never be published (they list speakers and review notes).
const forbidden = existsSync(join(src, 'packs')) ? findForbiddenPackFiles(join(src, 'packs')) : [];
if (forbidden.length) fail(forbidden.map((f) => forbiddenMessage(`packs/${f}`)).join('\n'));

const files = [];
const skipped = [];
const problems = [];
const bytesOf = new Map();
let total = 0;
for (const top of ['packs', 'regions']) {
  const dir = join(src, top);
  if (!existsSync(dir)) continue;
  for (const abs of walk(dir).sort()) {
    const path = relative(src, abs).split('\\').join('/');
    const isVoice = /^packs\/[^/]+\/voice\//.test(path);
    if (!isAllowedPath(path) || /^packs\/[^/]+\/index\.json$/.test(path) || (isVoice && !voiceTags.has(packTagOf(path)))) {
      skipped.push(path);
      continue;
    }
    const bytes = readFileSync(abs);
    if (bytes.length > maxFileBytes(path)) fail(`${path} is ${bytes.length} bytes; the limit is ${maxFileBytes(path)}`);
    try {
      validateUpdateFile(path, bytes);
    } catch (e) {
      problems.push(e.message);
      continue;
    }
    total += bytes.length;
    bytesOf.set(path, bytes);
    files.push({ path, sha256: sha(bytes), size: bytes.length });
  }
}

// audio/index.json and the clip files of a pack must match one to one: a listed clip without its file plays
// nothing, a file that is not listed is never played.
const present = new Set(files.map((f) => f.path));
for (const f of files) {
  const m = /^packs\/([^/]+)\/audio\/index\.json$/.exec(f.path);
  if (!m) continue;
  try {
    const listed = parseAudioIndex(JSON.parse(bytesOf.get(f.path).toString('utf8')), m[1]);
    for (const file of listed.values()) if (!present.has(`packs/${m[1]}/audio/${file}`)) problems.push(`packs/${m[1]}/audio/index.json lists ${file}, which is not in the pack`);
    const names = new Set(listed.values());
    for (const p of present) {
      const c = /^packs\/([^/]+)\/audio\/([^/]+)$/.exec(p);
      if (c && c[1] === m[1] && c[2] !== 'index.json' && !names.has(c[2])) problems.push(`${p} is not listed in packs/${m[1]}/audio/index.json`);
    }
  } catch {
    /* already reported by validateUpdateFile */
  }
}
if (problems.length) fail(`refusing to publish, ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
if (total > MAX_TOTAL_BYTES) fail(`total ${total} bytes is over the ${MAX_TOTAL_BYTES} limit`);
if (files.length === 0) fail(`no packs/ or regions/ files found under ${src}`);

// ---- index ------------------------------------------------------------------
let sequence = opt('sequence') ? Number(opt('sequence')) : undefined;
const prev = opt('previous');
if (prev) {
  let text;
  try {
    text = /^https?:\/\//.test(prev) ? await (await fetch(prev)).text() : readFileSync(prev, 'utf8');
  } catch (e) {
    fail(`cannot read --previous ${prev}: ${e.message}`);
  }
  const p = JSON.parse(text);
  if (!Number.isSafeInteger(p.sequence)) fail('--previous index has no sequence');
  sequence = Math.max(sequence ?? 0, p.sequence + 1);
}
if (sequence === undefined) {
  sequence = 1;
  console.error('warning: no --previous given, so sequence is 1. Phones that already installed a higher sequence will ignore this update.');
}
if (!Number.isSafeInteger(sequence) || sequence < 1) fail('sequence must be a positive integer');

const written = new Map(); // extra files written next to the copies (per-language lists)
let rootFiles = files;
let languages;
if (perLanguage) {
  languages = {};
  rootFiles = files.filter((f) => packTagOf(f.path) === null);
  const byTag = new Map();
  for (const f of files) {
    const t = packTagOf(f.path);
    if (t) byTag.set(t, [...(byTag.get(t) ?? []), f]);
  }
  for (const [tag, list] of [...byTag].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const listBytes = Buffer.from(JSON.stringify({ formatVersion: 1, tag, files: list }, null, 2) + '\n', 'utf8');
    const path = `packs/${tag}/index.json`;
    written.set(path, listBytes);
    let version;
    try {
      version = JSON.parse(bytesOf.get(`packs/${tag}/manifest.json`).toString('utf8')).version;
    } catch {
      /* a language without a manifest has no version to show */
    }
    languages[tag] = { index: { path, sha256: sha(listBytes), size: listBytes.length }, ...(typeof version === 'string' ? { version } : {}) };
  }
} else if (files.length > MAX_FILES) {
  fail(`${files.length} files is more than one index may list (${MAX_FILES}). Publish with --per-language.`);
}

const index = { formatVersion: 1, channel: 'stable', sequence, issuedAt: opt('issued-at') ?? new Date().toISOString(), files: rootFiles, ...(languages ? { languages } : {}) };
const indexBytes = Buffer.from(JSON.stringify(index, null, 2) + '\n', 'utf8');
const signature = sign(null, indexBytes, privateKey);
if (!verify(null, indexBytes, publicKey, signature)) fail('self-check of the signature failed');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of files) {
  const to = join(out, f.path);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, bytesOf.get(f.path));
}
for (const [path, b] of written) {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), b);
}
writeFileSync(join(out, 'index.json'), indexBytes);
writeFileSync(join(out, 'index.json.sig'), signature.toString('base64') + '\n');
// Used by Netlify and Cloudflare Pages; harmless elsewhere. The app (web and Android WebView) needs CORS to read the files.
writeFileSync(join(out, '_headers'), '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-cache\n');

const pubB64 = publicKey.export({ format: 'jwk' }).x;
console.log(`Published sequence ${sequence}: ${files.length} files${languages ? ` in ${Object.keys(languages).length} language lists` : ''}, ${(total / 1024 / 1024).toFixed(1)} MB -> ${out}`);
console.log(`Public key of this signature (must equal VITE_UPDATE_PUBLIC_KEY): ${Buffer.from(pubB64, 'base64url').toString('base64')}`);
const voiceSkipped = skipped.filter((p) => /\/voice\/.+\.onnx(\.json)?$/.test(p));
if (skipped.length) console.log(`Not published (not a file the app reads): ${skipped.join(', ')}`);
if (voiceSkipped.length) console.log('Voice models are published only with --voices <tag,...> (see docs/updates.md).');
console.log('Keep dist-updates/index.json: pass it as --previous next time.');
