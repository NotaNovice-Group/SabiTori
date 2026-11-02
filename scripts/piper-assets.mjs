/**
 * Prepares the static files the on-device Piper runtime loads (packages/speech/src/piper/worker.ts):
 *
 *   <out>/ort.wasm.min.mjs, ort-wasm-simd-threaded.{mjs,wasm}   onnxruntime-web (MIT), single-thread CPU build
 *   <out>/piper_phonemize.{mjs,wasm,data}                          espeak-ng + piper-phonemize (GPL-3.0 / MIT)
 *
 * The espeak-ng data from @diffusionstudio/piper-wasm holds a dictionary for about 100 languages
 * (18 MB). Only the dictionaries the bundled voices need are kept (the `espeak.voice` of every
 * packs/<tag>/voice/*.onnx.json, so French and English today, about 1.5 MB). A pack whose Piper model
 * uses phoneme_type "text" needs no dictionary at all. Used by apps/app/vite.config.ts.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const speechModules = join(root, 'packages/speech/node_modules');

/** espeak language codes ("fr", "en-gb-x-rp" -> "en") needed by the models under packs/<tag>/voice/. */
export function neededDictionaries(packsDir = join(root, 'packs')) {
  const langs = new Set();
  if (existsSync(packsDir)) {
    for (const tag of readdirSync(packsDir)) {
      const dir = join(packsDir, tag, 'voice');
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.onnx.json'))) {
        try {
          const cfg = JSON.parse(readFileSync(join(dir, f), 'utf8'));
          if (cfg.phoneme_type === 'text') continue;
          const v = cfg.espeak?.voice;
          if (typeof v === 'string' && v) langs.add(v.split('-')[0].toLowerCase());
        } catch {
          /* an invalid config is reported by the app when it loads the voice */
        }
      }
    }
  }
  return [...langs];
}

/** Keeps every file of the emscripten data package except `<lang>_dict` files for languages not in `keep`. */
export function trimEspeakPackage(js, data, keep) {
  const marker = 'loadPackage({"files":';
  const start = js.indexOf(marker);
  if (start < 0) throw new Error('piper_phonemize.js: file table not found (unexpected piper-wasm version)');
  const open = start + 'loadPackage('.length;
  const sizeKey = ',"remote_package_size":';
  const sizeAt = js.indexOf(sizeKey, open);
  const close = js.indexOf('}', sizeAt) + 1;
  const meta = JSON.parse(js.slice(open, close));
  const keepDict = new Set(keep.map((l) => `/espeak-ng-data/${l}_dict`));
  const files = meta.files.filter((f) => !/^\/espeak-ng-data\/[^/]+_dict$/.test(f.filename) || keepDict.has(f.filename));
  const chunks = [];
  let at = 0;
  const table = files.map((f) => {
    const piece = data.subarray(f.start, f.end);
    chunks.push(piece);
    const e = { filename: f.filename, start: at, end: at + piece.length };
    at += piece.length;
    return e;
  });
  const out = Buffer.concat(chunks);
  const newMeta = JSON.stringify({ files: table, remote_package_size: out.length });
  const trimmed = js.slice(0, open) + newMeta + js.slice(close);
  return { js: trimmed, data: out, kept: files.length, dropped: meta.files.length - files.length };
}

/** Makes the emscripten wrapper an ES module so a module Worker can `import()` it. */
export function toEsModule(js) {
  const tail = js.lastIndexOf('if (typeof exports');
  const body = tail >= 0 ? js.slice(0, tail) : js;
  return `${body}\nexport default createPiperPhonemize;\n`;
}

export function copyPiperRuntime(outDir, { dictionaries = neededDictionaries() } = {}) {
  mkdirSync(outDir, { recursive: true });
  const ortDist = join(speechModules, 'onnxruntime-web/dist');
  for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(join(ortDist, f), join(outDir, f));
  const pw = join(speechModules, '@diffusionstudio/piper-wasm/build');
  const t = trimEspeakPackage(readFileSync(join(pw, 'piper_phonemize.js'), 'utf8'), readFileSync(join(pw, 'piper_phonemize.data')), dictionaries);
  writeFileSync(join(outDir, 'piper_phonemize.mjs'), toEsModule(t.js));
  writeFileSync(join(outDir, 'piper_phonemize.data'), t.data);
  copyFileSync(join(pw, 'piper_phonemize.wasm'), join(outDir, 'piper_phonemize.wasm'));
  return { dictionaries, dataBytes: t.data.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv[2]) {
  console.log(copyPiperRuntime(process.argv[2]));
}
