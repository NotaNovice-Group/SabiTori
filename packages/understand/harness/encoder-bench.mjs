#!/usr/bin/env node
/**
 * Encoder latency in headless Chromium with CPU throttling, on the main thread (as the app runs it).
 *
 *   node packages/understand/harness/encoder-bench.mjs            # 4x CPU throttle (default)
 *   node packages/understand/harness/encoder-bench.mjs --throttle 1
 *   --chromium <path to chrome>   (default: Playwright's bundled Chromium)
 *
 * Classifies the test split of eval/messages.jsonl once (after a warm-up inside
 * createEncoderClassifier) and prints load time, median, p95 and max ms per message as JSON.
 * Report the result as "headless Chromium, 4x CPU throttle, main thread, <CPU model>": it is a
 * relative stress test on a desktop CPU, NOT a phone measurement. Chromium's throttle does not slow
 * Web Workers, which is one reason this runs on the main thread.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const throttle = Number(arg('--throttle', 4));
const appReq = createRequire(resolve(repo, 'apps/app/package.json'));
const { createServer } = await import(appReq.resolve('vite'));
const pw = await import(appReq.resolve('@playwright/test'));
const chromium = pw.chromium ?? pw.default.chromium;
const undReq = createRequire(resolve(repo, 'packages/understand/package.json'));
const ortDist = dirname(undReq.resolve('onnxruntime-web/wasm'));

const server = await createServer({
  root: resolve(here, 'encoder'),
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@sabitori/understand': resolve(repo, 'packages/understand/src/index.ts'), '@sabitori/core': resolve(repo, 'packages/core/src/index.ts') } },
  server: { port: 0, fs: { allow: [repo, ortDist] } },
  optimizeDeps: { noDiscovery: true },
});
await server.listen();
const { port } = server.httpServer.address();
const json = (p) => JSON.parse(readFileSync(resolve(repo, p), 'utf8'));
const rows = readFileSync(resolve(repo, 'packages/understand/eval/messages.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.split === 'test');
const region = json('regions/CM/region.json');
const lexicons = ['fr', 'en'].map((t) => json(`packs/${t}/reading.json`));
const browser = await chromium.launch({ ...(arg('--chromium') ? { executablePath: arg('--chromium') } : {}), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction('window.ready === true');
  if (throttle > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const base = `http://localhost:${port}/@fs`;
  const r = await page.evaluate(([rows, region, lexicons, m, w]) => window.bench(rows, region, lexicons, m, w), [rows, region, lexicons, `${base}${resolve(repo, 'packages/understand/model/minilm')}/`, `${base}${ortDist}/`]);
  console.log(JSON.stringify({ conditions: `headless Chromium ${browser.version()}, ${throttle}x CPU throttle, main thread, one wasm thread`, cpu: cpus()[0]?.model, ...r }));
} finally {
  await browser.close();
  await server.close();
}
