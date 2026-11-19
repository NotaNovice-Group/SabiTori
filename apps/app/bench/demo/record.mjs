#!/usr/bin/env node
/**
 * The one-minute demo video: the real built app (apps/app/dist) in a phone frame, driven by this script, with
 * captions beside it and what the app says shown as subtitles (headless Chromium has no voices).
 *
 *   pnpm --filter @sabitori/app build
 *   node apps/app/bench/demo/record.mjs <out-dir>        # screencast frames + frames.json
 *   cd <out-dir> && python3 <repo>/apps/app/bench/demo/assemble.py SabiTori-demo-60s.mp4   # needs ffmpeg
 *
 * Honest by construction: every card on screen is what the app produced for these inputs. The only edit is a cut
 * of the photo-reading wait (marks.ocrCutFrom..ocrCutTo, about 3 s); say so wherever the video is shown.
 * Messages and the photo are synthetic test samples (photo: test/ocr-bench/images/04-eneo-fr.jpg).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { chromiumPath } from '../../../../scripts/chromium-path.mjs';
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(process.argv[2] ?? 'demo-out');
rmSync(OUT + '/frames', { recursive: true, force: true });
mkdirSync(OUT + '/frames', { recursive: true });
const PORT = 4392, ORIGIN = `http://localhost:${PORT}`;
const server = spawn(APP + '/node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { cwd: APP, stdio: 'pipe' });
await new Promise((ok) => server.stdout.on('data', (d) => String(d).includes(String(PORT)) && ok()));

const STAGE = readFileSync(new URL('./stage.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-GB', serviceWorkers: 'block' });
await ctx.route(ORIGIN + '/__bill.jpg', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(APP + '/test/ocr-bench/images/04-eneo-fr.jpg') }));
await ctx.route(ORIGIN + '/__stage.html', (r) => r.fulfill({ contentType: 'text/html', body: STAGE }));
await ctx.addInitScript(() => {
  if (window.top === window) return;
  if (location.protocol.startsWith('http')) localStorage.setItem('sabitori.settings.v1', JSON.stringify({ onboarded: true, lang: 'en', listenFirst: false, speed: 0, retention: 30, region: 'CM' }));
  const synth = window.speechSynthesis;
  let timer;
  synth.speak = (u) => {
    const ms = Math.max(1300, u.text.length * 60);
    window.parent.__say?.(u.text);
    u.onstart?.(new Event('start'));
    timer = setTimeout(() => { window.parent.__say?.(''); u.onend?.(new Event('end')); }, ms);
  };
  synth.cancel = () => { clearTimeout(timer); window.parent.__say?.(''); };
});
const page = await ctx.newPage();
await page.goto(ORIGIN + '/__stage.html');
const frame = await (await page.waitForSelector('#app')).contentFrame();
await frame.waitForSelector('h1', { state: 'attached' });
await page.waitForTimeout(800);

// screencast
const cdp = await ctx.newCDPSession(page);
const frames = [];
let n = 0;
cdp.on('Page.screencastFrame', async (f) => {
  const file = `frames/${String(n++).padStart(5, '0')}.jpg`;
  writeFileSync(`${OUT}/${file}`, Buffer.from(f.data, 'base64'));
  frames.push({ file, t: f.metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
const now = () => Date.now() / 1000;
const marks = {};
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
// keep frames flowing even when nothing moves (a 1px ticker in the stage)
const step = (i) => page.evaluate((i) => window.__step(i), i);
const wait = (ms) => page.waitForTimeout(ms);
const tap = async (loc) => {
  const b = await loc.boundingBox();
  await page.evaluate(([x, y]) => window.__tap(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
  await wait(450);
  await loc.click();
};
const type = async (text) => {
  const box = frame.locator('#msg');
  await tap(box);
  await box.fill('');
  // a paste: the text arrives in a few quick chunks
  const parts = text.match(/.{1,40}(\s|$)/g);
  let acc = '';
  for (const p of parts) { acc += p; await box.fill(acc.trimEnd()); await wait(55); }
};
const scrollCard = async (px, ms) => {
  const steps = Math.round(ms / 40);
  for (let i = 0; i < steps; i++) { await frame.evaluate((d) => (document.scrollingElement || document.body).scrollBy(0, d), px / steps); await wait(40); }
};

// 1. intro
marks.start = now();
await step(0);
await wait(3600);

// 2. pasted French bill, explained and spoken in English
await step(1);
await tap(frame.getByRole('button', { name: /paste/i }).first());
await frame.waitForSelector('#msg');
await wait(500);
await type("ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 28 novembre 2026. Évitez la coupure. Service client: 677 00 12 34.");
await wait(700);
await tap(frame.locator('.dock .btn-primary'));
await frame.waitForSelector('.card .sec');
await wait(900);
await tap(frame.locator('.dock .play-main'));
await wait(7000);
await scrollCard(260, 1500);
await wait(14600);
await frame.evaluate(() => window.speechSynthesis.cancel());

// 3. scam
await step(2);
await frame.evaluate(() => (location.hash = '#/paste'));
await frame.waitForSelector('#msg');
await wait(400);
await type('Félicitations! Votre numéro a gagné 500 000 FCFA à la promo MTN. Pour recevoir votre gain, envoyez 5 000 FCFA de frais au 677 12 34 56 avant ce soir.');
await wait(500);
await tap(frame.locator('.dock .btn-primary'));
await frame.waitForSelector('.card .sec');
console.log('scam level', await frame.locator('.card').getAttribute('data-scam'));
await wait(800);
await tap(frame.locator('.dock .play-main'));
await wait(5600);
await frame.evaluate(() => window.speechSynthesis.cancel());

// 4. photo of a paper bill, read on the phone
await step(3);
await frame.evaluate(() => (location.hash = '#/'));
await frame.waitForSelector('h1', { state: 'attached' });
await wait(600);
const photoBtn = frame.getByRole('button', { name: /photo/i }).first();
if (await photoBtn.count()) { const b = await photoBtn.boundingBox().catch(() => null); if (b) await page.evaluate(([x, y]) => window.__tap(x, y), [b.x + b.width / 2, b.y + b.height / 2]); }
await page.evaluate(() => window.__photo(true));
await wait(1600);
await frame.locator('input[type=file]').first().setInputFiles(APP + '/test/ocr-bench/images/04-eneo-fr.jpg');
await wait(1500);
marks.ocrCutFrom = now();
await frame.waitForURL(/#\/card\//, { timeout: 120000 });
await frame.waitForSelector('.card .sec');
marks.ocrCutTo = now() - 0.6;
await page.evaluate(() => window.__photo(false));
await wait(1000);
await tap(frame.locator('.dock .play-main'));
await wait(3000);
await scrollCard(260, 1500);
await wait(2500);
await frame.evaluate(() => window.speechSynthesis.cancel());

// 5. outro
await step(4);
await wait(4700);
marks.end = now();
await cdp.send('Page.stopScreencast');
await wait(300);
writeFileSync(`${OUT}/frames.json`, JSON.stringify({ frames, marks }, null, 1));
console.log('frames', frames.length, 'marks', JSON.stringify(marks));
await browser.close();
server.kill();
