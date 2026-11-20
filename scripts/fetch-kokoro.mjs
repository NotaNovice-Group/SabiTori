#!/usr/bin/env node
/**
 * Downloads the Kokoro-82M voice (one model for every language, plus one small style file per voice) into
 * voices/kokoro/ from a pinned revision of https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX and checks
 * every file's sha256.
 *
 *   node scripts/fetch-kokoro.mjs            fetch what is missing or wrong, verify all
 *   node scripts/fetch-kokoro.mjs --check    verify only, never download (exit 1 if anything is missing)
 *
 * The files are git-ignored (the model is 177 MB); voices/kokoro/VOICE.md is committed. The app build
 * (apps/app/vite.config.ts) runs this like scripts/fetch-voices.mjs. Without network the build still succeeds and
 * the app speaks with Piper (then the phone's voice).
 *
 * Licences and sources: THIRD_PARTY_NOTICES.md and voices/kokoro/VOICE.md. To change the model or a voice, edit
 * FILES below (new revision, new sha256), KOKORO_VOICES / KOKORO_MODEL_FILE / KOKORO_VERSION in
 * packages/speech/src/kokoro/voices.ts, and those two documents together.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const KOKORO_DIR = join(root, 'voices', 'kokoro');
export const REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231'; // onnx-community/Kokoro-82M-v1.0-ONNX
const BASE = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${REVISION}`;

/** Repository path -> sha256. Served from public/kokoro/ under the same relative paths minus "onnx/". */
export const FILES = {
  'onnx/model_uint8.onnx': '6607a397d77b8514065420b7c1e7320117f7aabfdb45ce15f0050c5b0fe75aea',
  'voices/af_heart.bin': 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b',
  'voices/ff_siwis.bin': 'a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861',
};

/** espeak-ng dictionaries the Kokoro voices need (scripts/piper-assets.mjs keeps them in the trimmed data). */
export const KOKORO_ESPEAK_LANGS = ['en', 'fr'];

/** Where a repository file lives locally (and, relative to public/kokoro/, where the app serves it). */
export const localName = (repoPath) => repoPath.replace(/^onnx\//, '');

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function download(url, file, want) {
  const tmp = `${file}.part`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const got = await sha256(tmp);
  if (got !== want) {
    rmSync(tmp, { force: true });
    throw new Error(`sha256 mismatch for ${url}: expected ${want}, got ${got}`);
  }
  renameSync(tmp, file);
}

export async function fetchKokoro({ check = false, log = console.log, dir = KOKORO_DIR } = {}) {
  let failed = 0;
  for (const [path, want] of Object.entries(FILES)) {
    const file = join(dir, localName(path));
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file) && (await sha256(file)) === want) continue;
    if (check) {
      log(`MISSING or wrong: voices/kokoro/${localName(path)}`);
      failed++;
      continue;
    }
    log(`fetching voices/kokoro/${localName(path)}`);
    try {
      await download(`${BASE}/${path}`, file, want);
    } catch (e) {
      log(`FAILED voices/kokoro/${localName(path)}: ${e.message}`);
      failed++;
    }
  }
  if (!failed) log(`kokoro ok (${Object.keys(FILES).map(localName).join(', ')})`);
  return failed === 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ok = await fetchKokoro({ check: process.argv.includes('--check') });
  process.exit(ok ? 0 : 1);
}
