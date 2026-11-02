#!/usr/bin/env node
// Builds a signed update directory from packs/ and regions/.
//   UPDATE_SIGNING_KEY=<base64 secret> node scripts/updates-publish.mjs [--previous <index.json path or https URL>]
//        [--out dist-updates] [--sequence N] [--issued-at ISO]
// Upload the whole output directory to any static HTTPS host and set VITE_UPDATE_URL to it.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILE = 20 * 1024 * 1024;
const MAX_TOTAL = 300 * 1024 * 1024;
const TAG = '[a-z][a-z0-9_-]{0,31}';
// Keep in step with packages/connect/src/paths.ts (a test checks the published paths with the client's own validator).
const ALLOWED = [
  /^packs\/index\.json$/,
  new RegExp(`^packs/${TAG}/(manifest|phrases|rules|reading)\\.json$`),
  new RegExp(`^packs/${TAG}/audio/index\\.json$`),
  new RegExp(`^packs/${TAG}/audio/[a-z0-9][a-z0-9_.\\-]{0,63}\\.(webm|m4a)$`),
  /^regions\/[A-Z]{2}\/region\.json$/,
];

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (m) => {
  console.error(`error: ${m}`);
  process.exit(1);
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(opt('src') ?? root);
const out = resolve(opt('out') ?? join(root, 'dist-updates'));

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

const files = [];
const skipped = [];
let total = 0;
for (const top of ['packs', 'regions']) {
  const dir = join(src, top);
  if (!existsSync(dir)) continue;
  for (const abs of walk(dir).sort()) {
    const path = relative(src, abs).split('\\').join('/');
    if (!ALLOWED.some((re) => re.test(path))) {
      skipped.push(path);
      continue;
    }
    const bytes = readFileSync(abs);
    if (bytes.length > MAX_FILE) fail(`${path} is ${bytes.length} bytes; the limit is ${MAX_FILE}`);
    total += bytes.length;
    files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length });
  }
}
if (total > MAX_TOTAL) fail(`total ${total} bytes is over the ${MAX_TOTAL} limit`);
if (files.length === 0) fail(`no packs/ or regions/ files found under ${src}`);

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

const index = { formatVersion: 1, channel: 'stable', sequence, issuedAt: opt('issued-at') ?? new Date().toISOString(), files };
const indexBytes = Buffer.from(JSON.stringify(index, null, 2) + '\n', 'utf8');
const signature = sign(null, indexBytes, privateKey);
if (!verify(null, indexBytes, publicKey, signature)) fail('self-check of the signature failed');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of files) {
  const to = join(out, f.path);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(src, f.path), to);
}
writeFileSync(join(out, 'index.json'), indexBytes);
writeFileSync(join(out, 'index.json.sig'), signature.toString('base64') + '\n');
// Used by Netlify and Cloudflare Pages; harmless elsewhere. The app (web and Android WebView) needs CORS to read the files.
writeFileSync(join(out, '_headers'), '/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: no-cache\n');

const pubB64 = publicKey.export({ format: 'jwk' }).x;
console.log(`Published sequence ${sequence}: ${files.length} files, ${(total / 1024 / 1024).toFixed(1)} MB -> ${out}`);
console.log(`Public key of this signature (must equal VITE_UPDATE_PUBLIC_KEY): ${Buffer.from(pubB64, 'base64url').toString('base64')}`);
if (skipped.length) console.log(`Not published (not a file the app reads): ${skipped.join(', ')}`);
console.log('Keep dist-updates/index.json: pass it as --previous next time.');
