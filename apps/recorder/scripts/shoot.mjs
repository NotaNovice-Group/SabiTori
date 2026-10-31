#!/usr/bin/env node
/**
 * Screenshot QA. Builds nothing: run `pnpm build` first. Starts `vite preview`,
 * seeds IndexedDB with a demo project ("Testish": invented letters, not a real
 * language), and captures the main screens at 1280x800 and 390x844 into
 * ../screenshots/.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'screenshots');
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
let chromium;
for (const base of [process.env.PW_NODE_PATH, '/opt/node-tools/node_modules', join(root, 'node_modules')].filter(Boolean)) {
  try { ({ chromium } = require(require.resolve('playwright', { paths: [base] }))); break; } catch { /* next */ }
}
if (!chromium) throw new Error('playwright not found; set PW_NODE_PATH');

const PORT = 4179;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const url = `http://localhost:${PORT}/`;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(url)).ok) break; } catch { /* wait */ }
  await new Promise((r) => setTimeout(r, 250));
}

const enRules = readFileSync(join(root, '../../packs/en/rules.json'), 'utf8');
const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: exe });

const seed = async (page) => {
  await page.evaluate(async (rulesText) => {
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open('sabitori-recorder', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); r.result.createObjectStore('clips'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const db = await open();
    const put = (store, v, k) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const id = 'tst-demo';
    const now = Date.now();
    const P = (text, extra = {}) => ({ text, review: 'none', ...extra });
    const project = {
      id, tag: 'tst', name: 'Testish', autonym: 'Ɛtɛsɔ', fallback: ['fr'], license: 'CC-BY-SA-4.0',
      speakers: [
        { id: 's1', name: 'Amina N.', role: 'speaker', consent: true },
        { id: 's2', name: 'Joseph E.', role: 'reviewer', consent: true },
      ],
      activeSpeakerId: 's2',
      palette: ['ɓ', 'ɗ', 'ŋ', 'ɛ', 'ɔ', 'ə', 'ƴ', 'ʼ', '́', '̀', '̂', '̌', '̄'],
      phrases: {
        'scam.likely': P('Ɓɔ ŋɛ ɗə́ ɔ. Ɛ ɓɔ ɗɔ.', { recordedBy: 's1' }),
        'scam.caution': P('Ŋɛ ɓɔ ɗə.', { recordedBy: 's1', review: 'reviewed', reviewedBy: 's2' }),
        'scam.signal.link': P('Ɗə ɓɔ ŋɛ ɔ ƴɛ.', { recordedBy: 's1', review: 'sent_back', note: 'The last word is too fast.' }),
        'sender.known': P('Ɓɔ {sender} ŋɛ ɗə́.', { recordedBy: 's1' }),
        'deadline.by': P('Ɓɔ ŋɛ {date} ɗə́ ɔ'),
        'money.amount': P('Ŋɛ {amount} ɓɔ'),
        'urgency.soon': P('Ɓɔ ɗə.'),
      },
      atoms: {}, rulesText, version: '0.1.0', exportStatus: 'in_recording', createdAt: now, updatedAt: now,
    };
    await put('projects', project);
    // A short synthetic tone as the "recording".
    const wav = (ms) => {
      const sr = 16000, n = Math.round(sr * ms / 1000), b = new DataView(new ArrayBuffer(44 + n * 2));
      const w = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
      b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.sin(i / 20) * 6000, true);
      return new Blob([b.buffer], { type: 'audio/wav' });
    };
    const clip = (cid, text, ms) => put('clips', { id: cid, blob: wav(ms), durationMs: ms, text, speakerId: 's1', ext: 'webm', at: now }, `${id}:${cid}`);
    await clip('scam.likely.0', 'Ɓɔ ŋɛ ɗə́ ɔ. Ɛ ɓɔ ɗɔ.', 2300);
    await clip('scam.caution.0', 'Ŋɛ ɓɔ ɗə.', 1400);
    await clip('scam.signal.link.0', 'Ɗə ɓɔ ŋɛ ɔ ƴɛ.', 1900);
    await clip('sender.known.0', 'Ɓɔ', 600);
    await clip('sender.known.1', 'ŋɛ ɗə́.', 1100);
    await clip('deadline.by.0', 'Ɓɔ ŋɛ', 1000);
    await clip('deadline.by.1', 'old wording', 800);
    await clip('num.1', 'mɔ́ɔ', 700);
  }, enRules);
};

const shots = [];
for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: name === 'phone', isMobile: name === 'phone' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
  const snap = async (label, full = name === 'phone') => {
    await page.waitForTimeout(150);
    const f = join(out, `${label}-${name}.png`);
    await page.screenshot({ path: f, fullPage: full });
    shots.push(f);
  };
  await page.goto(url);
  await page.evaluate(() => indexedDB.deleteDatabase('sabitori-recorder'));
  await page.reload();
  await page.waitForSelector('h1');
  await snap('01-start-new');
  await seed(page);
  await page.reload();
  await page.waitForSelector('.proj');
  await snap('02-start-continue');
  await page.click('.proj');
  await page.waitForSelector('.shell');

  const openKey = async (key) => {
    const item = page.locator(`[data-key="${key}"]`);
    if (!(await item.count())) await page.locator(`[data-section="${key.split('.')[0]}"]`).click();
    await item.click();
  };
  await snap('03-queue');
  if (name === 'phone') {
    await page.click('[data-section="deadline"]');
    await snap('03b-queue-open');
  }
  await openKey('deadline.by');
  await page.waitForSelector('.work');
  await snap('04-work-recording', name === 'phone');
  await page.locator('textarea').waitFor();
  if (name === 'phone') await page.getByRole('button', { name: 'All phrases' }).click();
  await openKey('sender.known');
  await page.waitForTimeout(100);
  await snap('05-work-sender', name === 'phone');
  // Slot validation error
  if (name === 'phone') await page.getByRole('button', { name: 'All phrases' }).click();
  await openKey('deadline.by');
  const ta = page.locator('textarea');
  await ta.fill('Ɓɔ ŋɛ {sum} ɗə́');
  await snap('06-work-invalid', name === 'phone');
  await ta.fill('Ɓɔ ŋɛ {date} ɗə́ ɔ');
  await page.getByRole('button', { name: 'Edit letters' }).click();
  await snap('07-work-palette', name === 'phone');
  const nav = (label) => page.locator(name === 'phone' ? '.tabbar' : '.nav').getByRole('button', { name: label }).click();
  await nav('Numbers');
  await page.waitForSelector('.atom');
  await snap('08-numbers');
  await nav('Review');
  await page.waitForSelector('.review');
  await snap('09-review');
  await nav('Pack');
  await page.waitForSelector('.export');
  await snap('10-pack');
  await ctx.close();
}
await browser.close();
server.kill();
console.log(shots.join('\n'));
