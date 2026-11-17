import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { cpSync, existsSync, mkdirSync, copyFileSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCsp } from './src/lib/connect-env';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');

/**
 * Copies the language packs, regions, OCR engine/data, the shared onnxruntime-web files and the wllama wasm into
 * public/ so the engine fetches everything from the app's own origin, offline.
 * Runs at config time, so dev, build and preview all see the same files.
 */
function sabitoriAssets(): Plugin {
  return {
    name: 'sabitori-assets',
    config(_cfg, env) {
      const pub = resolve(here, 'public');
      for (const dir of ['packs', 'regions']) {
        const from = resolve(repo, dir);
        const to = resolve(pub, dir);
        if (existsSync(from)) {
          rmSync(to, { recursive: true, force: true });
          // Voice models are copied separately below, only for the bundled voices.
          cpSync(from, to, { recursive: true, filter: (p) => !p.endsWith('README.md') && !/\.onnx$/.test(p) });
        }
      }
      // OCR: worker, ONE LSTM-only core (SIMD build; ocr.ts names it explicitly, so the loader never asks for the
      // non-SIMD or relaxed-SIMD ones), fra + eng data in the integer-quantised "best" format (4.0.0_best_int).
      // Why these choices: apps/app/test/ocr-bench/RESULTS.md ("Model files" and "Core variants").
      const reqApp = createRequire(resolve(here, 'package.json'));
      const ocr = resolve(pub, 'ocr');
      rmSync(ocr, { recursive: true, force: true }); // drop files staged by older builds
      mkdirSync(ocr, { recursive: true });
      const tessDist = dirname(reqApp.resolve('tesseract.js/dist/worker.min.js'));
      copyFileSync(resolve(tessDist, 'worker.min.js'), resolve(ocr, 'worker.min.js'));
      const coreDir = dirname(reqApp.resolve('tesseract.js-core/package.json', { paths: [dirname(reqApp.resolve('tesseract.js/package.json'))] }));
      for (const f of ['tesseract-core-simd-lstm.wasm.js']) {
        copyFileSync(resolve(coreDir, f), resolve(ocr, f));
      }
      for (const lang of ['fra', 'eng']) {
        const pkg = dirname(reqApp.resolve(`@tesseract.js-data/${lang}/package.json`));
        // Stored un-gzipped on purpose: the Android build (AGP mergeAssets) strips ".gz" from asset names and
        // un-gzips them, so a "eng.traineddata.gz" would not exist inside the APK. The APK and the web host compress anyway.
        writeFileSync(resolve(ocr, `${lang}.traineddata`), gunzipSync(readFileSync(resolve(pkg, '4.0.0_best_int', `${lang}.traineddata.gz`))));
      }
      // wllama wasm (the optional LLM): only in builds with VITE_LLM=1. Store builds ship without it (8-9 MB less).
      rmSync(resolve(pub, 'wllama'), { recursive: true, force: true });
      if ((loadEnv(env.mode, here, 'VITE_').VITE_LLM ?? '').trim() === '1') {
        try {
          const reqU = createRequire(resolve(repo, 'packages/understand/package.json'));
          const wasm = resolve(dirname(reqU.resolve('@wllama/wllama/package.json')), 'esm/wasm/wllama.wasm');
          if (existsSync(wasm)) {
            mkdirSync(resolve(pub, 'wllama'), { recursive: true });
            copyFileSync(wasm, resolve(pub, 'wllama/wllama.wasm'));
          }
        } catch {
          /* wllama not installed: rules and the built-in encoder only */
        }
      }
      // Built-in understanding model (MiniLM int8 + heads) and the onnxruntime-web wasm that runs it.
      try {
        const reqU = createRequire(resolve(repo, 'packages/understand/package.json'));
        const ortDist = dirname(reqU.resolve('onnxruntime-web/wasm'));
        mkdirSync(resolve(pub, 'ort'), { recursive: true });
        // One onnxruntime-web (1.22.0, pinned in both packages) and one wasm serve the encoder AND the Piper worker.
        for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs', 'ort.wasm.min.mjs']) copyFileSync(resolve(ortDist, f), resolve(pub, 'ort', f));
        const modelSrc = resolve(repo, 'packages/understand/model/minilm');
        mkdirSync(resolve(pub, 'models/minilm'), { recursive: true });
        for (const f of ['encoder.int8.onnx', 'tokenizer.json', 'heads.json']) copyFileSync(resolve(modelSrc, f), resolve(pub, 'models/minilm', f));
      } catch {
        /* encoder model or onnxruntime-web missing: rules only */
      }
      // On-device Piper voices: make sure the models are present (scripts/fetch-voices.mjs, pinned + sha256;
      // without network the build still succeeds and the app speaks with the phone's own voice), copy them,
      // and stage the Piper runtime (onnxruntime-web + trimmed espeak-ng) under public/piper/.
      try {
        const node = process.execPath;
        const run = (script: string, ...args: string[]) => spawnSync(node, [resolve(repo, 'scripts', script), ...args], { stdio: 'inherit' });
        if (run('fetch-voices.mjs', '--check').status !== 0) run('fetch-voices.mjs');
        // Only these voices ship inside the app (the English voice alone is 63 MB, too heavy for cheap
        // phones and data plans). Other voices arrive later through the signed update channel; until
        // then those languages use the phone's own voice.
        const bundled = (process.env.SABITORI_BUNDLE_VOICES ?? 'fr').split(',').map((t) => t.trim()).filter(Boolean);
        for (const tag of readdirSync(resolve(repo, 'packs'))) {
          if (!bundled.includes(tag)) continue;
          const vdir = resolve(repo, 'packs', tag, 'voice');
          if (!existsSync(vdir)) continue;
          for (const f of readdirSync(vdir)) {
            if (f.endsWith('.onnx')) {
              mkdirSync(resolve(pub, 'packs', tag, 'voice'), { recursive: true });
              copyFileSync(resolve(vdir, f), resolve(pub, 'packs', tag, 'voice', f));
            }
          }
        }
        rmSync(resolve(pub, 'piper'), { recursive: true, force: true }); // drop files staged by older builds
        if (run('piper-assets.mjs', resolve(pub, 'piper')).status !== 0) console.warn('[sabitori] Piper runtime not staged: the app will use the phone voice');
      } catch (e) {
        console.warn('[sabitori] Piper voices not staged:', e);
      }
    },
  };
}

/**
 * Content-Security-Policy for the built app (web and Android WebView). connect-src is 'self' plus the
 * two optional origins, derived at build time from VITE_UPDATE_URL and VITE_SENTRY_DSN only.
 */
function sabitoriCsp(mode: string): Plugin {
  return {
    name: 'sabitori-csp',
    apply: 'build',
    transformIndexHtml() {
      const env = loadEnv(mode, here, 'VITE_');
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(env) }, injectTo: 'head-prepend' }];
    },
  };
}

/**
 * Use onnxruntime-web's "extern wasm" build: the wasm and its loader are the two files sabitoriAssets
 * copies to public/ort, instead of a second 15 MB copy of the wasm inside the JS bundle.
 */
function sabitoriOrtExternWasm(): Plugin {
  return {
    name: 'sabitori-ort-extern-wasm',
    enforce: 'pre',
    resolveId(id) {
      if (id !== 'onnxruntime-web/wasm') return null;
      try {
        const reqU = createRequire(resolve(repo, 'packages/understand/package.json'));
        return resolve(dirname(reqU.resolve('onnxruntime-web/wasm')), 'ort.wasm.min.mjs');
      } catch {
        return null;
      }
    },
  };
}

const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    sabitoriAssets(),
    sabitoriOrtExternWasm(),
    sabitoriCsp(mode),
    react(),
    VitePWA({
      // 'prompt': a new service worker waits until every page of the app is closed (no skipWaiting /
      // clientsClaim), so an open page keeps the precache its lazy chunks come from. Registered by
      // src/lib/sw.ts, and never inside the Android app (everything is in the APK there).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['mark.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,json,wasm,gz,webm,m4a,mp3,ogg}', 'models/**/*.onnx', 'piper/*.data', 'ocr/*.traineddata'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Piper voice models (28 to 63 MB each) are cached the first time they load; the Android app ships them in the APK.
        runtimeCaching: [{ urlPattern: /\/packs\/[^/]+\/voice\/[^/]+\.onnx$/, handler: 'CacheFirst', options: { cacheName: 'sabitori-voices', cacheableResponse: { statuses: [200] } } }],
      },
      manifest: {
        name: 'SabiTori',
        short_name: 'SabiTori',
        description: 'SabiTori',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#EEF0EC',
        theme_color: '#EEF0EC',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
      } as never,
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { environment: 'jsdom', include: ['test/**/*.test.ts', 'test/**/*.test.tsx'] },
} as never));
