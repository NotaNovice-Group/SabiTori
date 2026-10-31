// Visual QA: builds, serves and screenshots every screen into apps/app/screenshots/.
//   node scripts/shoot.mjs [--no-build] [--only 360-light-100] [--screens card-scam,home]
import { chromium } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'screenshots');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

if (!flag('no-build')) execSync('pnpm build', { cwd: root, stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

import { createServer } from 'node:net';
const PORT = await new Promise((res) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const BILL = "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 12 novembre 2026. Évitez la coupure. Service client: 677 00 12 34.";
const VAGUE = 'Bonjour. Passez nous voir quand vous pouvez, nous avons quelque chose pour vous. Merci.';

const combos = [
  { vp: [360, 780], scheme: 'light', scale: 1 },
  { vp: [412, 915], scheme: 'light', scale: 1 },
  { vp: [360, 780], scheme: 'dark', scale: 1 },
  { vp: [412, 915], scheme: 'dark', scale: 1 },
  { vp: [360, 780], scheme: 'light', scale: 1.3 },
];

// A photo to feed the capture flow: sharp text, and a blurred copy.
async function makePhotos(browser) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const html = (blur) => `<body style="margin:0;background:#f4f1ea;font:34px/1.5 Georgia,serif;color:#111;padding:60px;filter:blur(${blur}px)"><b>ENEO CAMEROON</b><br>Facture d'électricité<br>Montant à payer : 18 450 FCFA<br>Date limite de paiement : 12 novembre 2026<br>Veuillez régler votre facture avant cette date pour éviter la coupure.<br>Service client : 677 00 12 34</body>`;
  await page.setContent(html(0)); await page.screenshot({ path: resolve(out, '_sharp.png') });
  await page.setContent(html(7)); await page.screenshot({ path: resolve(out, '_blur.png') });
  await page.close();
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
await makePhotos(browser);

const seed = { onboarded: true, lang: 'fr', listenFirst: false, speed: 0, retention: 30, region: 'CM' };
const only = opt('only');
const wanted = opt('screens')?.split(',');

for (const c of combos) {
  const tag = `${c.vp[0]}-${c.scheme}-${Math.round(c.scale * 100)}`;
  if (only && only !== tag) continue;
  const ctx = await browser.newContext({ viewport: { width: c.vp[0], height: c.vp[1] }, colorScheme: c.scheme, serviceWorkers: 'block', deviceScaleFactor: 1, locale: 'fr-FR', reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => {
    // Headless Chromium has no voices: simulate a slow voice so the lit section is visible.
    let id;
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = (u) => { let i = 0; clearInterval(id); id = setInterval(() => { i += 3; u.onboundary?.({ charIndex: i }); if (i >= u.text.length) { clearInterval(id); u.onend?.(); } }, 200); };
      synth.cancel = () => clearInterval(id);
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', tag, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', tag, m.text()); });
  const shot = async (name, opts = {}) => {
    if (wanted && !wanted.includes(name)) return;
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(out, `${tag}-${name}.png`), ...opts });
  };
  const scaleCss = c.scale !== 1 ? `html{font-size:${c.scale * 100}% !important}` : '';
  const go = async (hash) => { await page.goto(base + hash); await page.reload(); if (scaleCss) await page.addStyleTag({ content: scaleCss }); await page.waitForSelector('h1', { state: 'attached' }); };

  // first run (no settings)
  await go('#/welcome');
  await shot('welcome-language');
  await page.goto(base + '#/mode'); await shot('welcome-mode');

  // seeded settings from here on
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify(s)), seed);
  await go('#/');
  await shot('home-empty');

  // history: paste two messages through the real flow
  for (const [text, who] of [[BILL, 'ENEO'], [VAGUE, '']]) {
    await go('#/paste');
    await page.fill('#msg', text);
    if (who) { await page.getByRole('radio', { name: /nom/i }).click(); await page.fill('#who', who); }
    await page.locator('.dock .btn-primary').click();
    await page.waitForURL(/#\/card\//);
    if (text === BILL) { await page.waitForSelector('.sec'); await shot('card-bill'); await page.waitForSelector('.sec'); await shot('card-bill-full', { fullPage: true }); }
    else { await page.waitForSelector('.sec'); await shot('card-facts-only'); await shot('card-facts-only-full', { fullPage: true }); }
  }
  // scam card from the practice list
  await go('#/practice'); await shot('practice');
  await go('#/example/momo'); await page.waitForSelector('.sec-scam');
  await shot('card-scam'); await shot('card-scam-full', { fullPage: true });
  await page.locator('.dock .play-main').click(); await page.waitForTimeout(2500);
  await shot('card-scam-playing');
  await page.locator('.fact-source').first().click().catch(() => {});
  await shot('card-source-sheet');
  await page.keyboard.press('Escape');
  await go('#/example/prize'); await page.waitForSelector('.sec-scam'); await shot('card-prize', { fullPage: true });
  await go('#/example/hospital'); await page.waitForSelector('.sec'); await shot('card-hospital', { fullPage: true });
  await page.locator('.topbar-right button').click(); await shot('card-helper');
  await page.keyboard.press('Escape');

  await go('#/'); await shot('home-history');
  await go('#/paste'); await shot('paste');
  await page.getByRole('radio', { name: /numéro/i }).click(); await shot('paste-number');

  // capture flow with a real photo
  await go('#/');
  await page.locator('input[type=file]').setInputFiles(resolve(out, '_blur.png'));
  await page.waitForSelector('.status'); await page.waitForTimeout(600); await shot('capture-blurry');
  await go('#/');
  await page.locator('input[type=file]').setInputFiles(resolve(out, '_sharp.png'));
  await page.waitForTimeout(700); await shot('capture-reading');
  await page.waitForURL(/#\/card\//, { timeout: 90000 }).catch(() => console.log('OCR did not finish', tag));
  await page.waitForTimeout(500); await shot('card-from-photo');

  await go('#/settings'); await shot('settings'); await shot('settings-full', { fullPage: true });
  await ctx.close();
}
await browser.close();
server.kill();
// shoot also leaves _sharp/_blur fixtures; remove them
for (const f of ['_sharp.png', '_blur.png']) rmSync(resolve(out, f), { force: true });
writeFileSync(resolve(out, '.gitkeep'), '');
console.log('screenshots in', out);
