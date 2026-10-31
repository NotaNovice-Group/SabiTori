import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { cpSync, existsSync, mkdirSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');

/**
 * Copies the language packs, regions, OCR engine/data and the wllama wasm into
 * public/ so the engine fetches everything from the app's own origin, offline.
 * Runs at config time, so dev, build and preview all see the same files.
 */
function sabitoriAssets(): Plugin {
  return {
    name: 'sabitori-assets',
    config() {
      const pub = resolve(here, 'public');
      for (const dir of ['packs', 'regions']) {
        const from = resolve(repo, dir);
        const to = resolve(pub, dir);
        if (existsSync(from)) {
          rmSync(to, { recursive: true, force: true });
          cpSync(from, to, { recursive: true, filter: (p) => !p.endsWith('README.md') });
        }
      }
      // OCR: worker, three LSTM-only cores (the loader picks the best one the phone supports), fra + eng data.
      const reqApp = createRequire(resolve(here, 'package.json'));
      const ocr = resolve(pub, 'ocr');
      mkdirSync(ocr, { recursive: true });
      const tessDist = dirname(reqApp.resolve('tesseract.js/dist/worker.min.js'));
      copyFileSync(resolve(tessDist, 'worker.min.js'), resolve(ocr, 'worker.min.js'));
      const coreDir = dirname(reqApp.resolve('tesseract.js-core/package.json', { paths: [dirname(reqApp.resolve('tesseract.js/package.json'))] }));
      for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
        copyFileSync(resolve(coreDir, f), resolve(ocr, f));
      }
      for (const lang of ['fra', 'eng']) {
        const pkg = dirname(reqApp.resolve(`@tesseract.js-data/${lang}/package.json`));
        copyFileSync(resolve(pkg, '4.0.0', `${lang}.traineddata.gz`), resolve(ocr, `${lang}.traineddata.gz`));
      }
      // wllama wasm (understanding model), resolved from the understand package.
      try {
        const reqU = createRequire(resolve(repo, 'packages/understand/package.json'));
        const wasm = resolve(dirname(reqU.resolve('@wllama/wllama/package.json')), 'esm/wasm/wllama.wasm');
        if (existsSync(wasm)) {
          mkdirSync(resolve(pub, 'wllama'), { recursive: true });
          copyFileSync(wasm, resolve(pub, 'wllama/wllama.wasm'));
        }
      } catch {
        /* wllama not installed: rules only */
      }
    },
  };
}

const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    sabitoriAssets(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['mark.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,wasm,gz,webm,m4a,mp3,ogg}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
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
} as never);
