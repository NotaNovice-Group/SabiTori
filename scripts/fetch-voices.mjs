#!/usr/bin/env node
/**
 * Downloads the bundled Piper voices into packs/<tag>/voice/ from a pinned revision of
 * https://huggingface.co/rhasspy/piper-voices and checks every file's sha256.
 *
 *   node scripts/fetch-voices.mjs            fetch what is missing or wrong, verify all
 *   node scripts/fetch-voices.mjs --check    verify only, never download (exit 1 if anything is missing)
 *
 * The .onnx models are git-ignored (together they are over 80 MB); the small .onnx.json configs,
 * MODEL_CARDs and VOICE.md are committed. The app build (apps/app/vite.config.ts) runs this when a model
 * is missing. If it cannot download, the build still succeeds and the app speaks with the phone's own
 * voice (a warning says so).
 *
 * Licences and sources: THIRD_PARTY_NOTICES.md and packs/<tag>/voice/VOICE.md. To add or change a voice,
 * edit VOICES below (new revision, new sha256) and those two documents together.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REVISION = 'b4e358ffcb232591bf73a540e70f7de528e4174a'; // rhasspy/piper-voices, 2026-10-30
const BASE = `https://huggingface.co/rhasspy/piper-voices/resolve/${REVISION}`;

export const VOICES = [
  {
    tag: 'fr',
    id: 'fr_FR-siwis-medium',
    path: 'fr/fr_FR/siwis/medium',
    files: {
      'fr_FR-siwis-medium.onnx': '641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99',
      'fr_FR-siwis-medium.onnx.json': '39479916c2db192b5ac9764daddd0c744d83e023ad890c6976c0633ae4df8959',
      MODEL_CARD: 'bd8b8d079d4d3d2c4cc20345889bbcd586d72f021a132f93357a763eb5232cce',
    },
  },
  {
    tag: 'en',
    id: 'en_GB-alba-medium',
    path: 'en/en_GB/alba/medium',
    files: {
      'en_GB-alba-medium.onnx': '401369c4a81d09fdd86c32c5c864440811dbdcc66466cde2d64f7133a66ad03b',
      'en_GB-alba-medium.onnx.json': 'aa965a2f02ecced632c2694e1fc72bbff6d65f265fab567ca945918c73dd89f4',
      MODEL_CARD: 'fa166b1779404c470b0b6b4ba0238bc4a35bf89d2cd130c6788f697188b737d6',
    },
  },
];

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function good(file, want) {
  return existsSync(file) && (await sha256(file)) === want;
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

export async function fetchVoices({ check = false, log = console.log } = {}) {
  let failed = 0;
  for (const v of VOICES) {
    const dir = join(root, 'packs', v.tag, 'voice');
    mkdirSync(dir, { recursive: true });
    for (const [name, want] of Object.entries(v.files)) {
      const file = join(dir, name);
      if (await good(file, want)) continue;
      if (check) {
        log(`MISSING or wrong: packs/${v.tag}/voice/${name}`);
        failed++;
        continue;
      }
      log(`fetching packs/${v.tag}/voice/${name}`);
      try {
        await download(`${BASE}/${v.path}/${name}`, file, want);
      } catch (e) {
        log(`FAILED packs/${v.tag}/voice/${name}: ${e.message}`);
        failed++;
      }
    }
  }
  if (!failed) log(`voices ok (${VOICES.map((v) => v.id).join(', ')})`);
  return failed === 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ok = await fetchVoices({ check: process.argv.includes('--check') });
  process.exit(ok ? 0 : 1);
}
