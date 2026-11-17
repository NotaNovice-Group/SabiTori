#!/usr/bin/env node
/**
 * App performance on a simulated slow phone, in headless Chromium (docs/model.md, "App start and card time").
 *
 *   pnpm --filter @sabitori/app build
 *   node apps/app/bench/perf.mjs [cpuThrottle=4] [runs=3]     (WAIT_MODEL=<ms>: tap only after the model has loaded, plus <ms>)
 *
 * Serves apps/app/dist with `vite preview`, then for each run, in a fresh browser profile (nothing cached):
 * - start: navigation to the first screen's title in the page (the app's own JavaScript has run)
 * - card: tap "Explain" on a pasted bill to the card on screen (rules path; the built-in model may still be loading)
 * - model: navigation until the built-in model (MiniLM) and its runtime have finished downloading
 * - heap: JavaScript heap in use once the card is shown
 * - js: JavaScript bytes loaded for the first screen
 * Chromium's CPU throttling slows the page's main thread only, not Web Workers (OCR and Piper run in workers),
 * and this machine is not a phone: treat the numbers as a relative stress test, not phone measurements.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { chromiumPath } from '../../../scripts/chromium-path.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const throttle = Number(process.argv[2] ?? 4);
const runs = Number(process.argv[3] ?? 3);
const PORT = 4391;
const BILL =
  "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 12 novembre 2026. Évitez la coupure. Service client: 677 00 12 34.";
const SEED = { onboarded: true, lang: 'fr', listenFirst: false, speed: 0, retention: 30, region: 'CM' };

const server = spawn(resolve(app, 'node_modules/.bin/vite'), ['preview', '--port', String(PORT), '--strictPort'], { cwd: app, stdio: 'pipe' });
await new Promise((ok, fail) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && ok());
  server.on('exit', (c) => fail(new Error(`vite preview exited (${c}); build the app first`)));
});
const url = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox', '--enable-precise-memory-info'] });
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const rows = [];
try {
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: 'fr-FR', serviceWorkers: 'block' });
    await ctx.addInitScript((s) => {
      if (location.protocol.startsWith('http')) localStorage.setItem('sabitori.settings.v1', JSON.stringify(s));
      const synth = window.speechSynthesis;
      if (synth) synth.speak = (u) => void setTimeout(() => u.onend?.(new Event('end')), 10);
    }, SEED);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    let js = 0;
    const model = { onnx: 0, wasm: 0 };
    const t0 = Date.now();
    page.on('response', async (r) => {
      const u = r.url();
      if (u.endsWith('.js') || u.endsWith('.mjs')) js += (await r.body().catch(() => Buffer.alloc(0))).length;
      if (u.endsWith('encoder.int8.onnx')) await r.finished().then(() => (model.onnx = Date.now() - t0));
      if (u.endsWith('ort-wasm-simd-threaded.wasm')) await r.finished().then(() => (model.wasm = Date.now() - t0));
    });
    await page.goto(url + '#/paste');
    await page.waitForSelector('h1', { state: 'attached' });
    const start = Date.now() - t0;
    const jsStart = js;
    if (process.env.WAIT_MODEL) { const u = Date.now() + 120_000; while ((!model.onnx || !model.wasm) && Date.now() < u) await new Promise((r) => setTimeout(r, 100)); await page.waitForTimeout(Number(process.env.WAIT_MODEL)); }
    await page.fill('#msg', BILL);
    const c0 = Date.now();
    await page.locator('.dock .btn-primary').click();
    await page.waitForSelector('.card .sec', { timeout: 120_000 });
    const card = Date.now() - c0;
    const { metrics } = await cdp.send('Performance.getMetrics');
    const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
    const until = Date.now() + 120_000;
    while ((!model.onnx || !model.wasm) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    rows.push({ start, card, model: Math.max(model.onnx, model.wasm), heapMB: +(heap / 1048576).toFixed(1), jsKB: Math.round(jsStart / 1024) });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
const keys = ['start', 'card', 'model', 'heapMB', 'jsKB'];
console.log(JSON.stringify({ throttle, runs, rows, median: Object.fromEntries(keys.map((k) => [k, median(rows.map((r) => r[k]))])) }, null, 1));
