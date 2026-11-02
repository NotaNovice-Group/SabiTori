// Accessibility audit: builds the app (with the optional connected features switched on so every
// screen exists), serves it with `vite preview`, visits every screen/state at 360x780 with font
// scales 100/150/200 % in light and dark, and runs axe-core (WCAG 2.2 AA) plus the checks axe cannot do.
//   node scripts/a11y.mjs [--no-build] [--quick] [--scales 1,2] [--schemes light] [--no-shots]
// Writes a11y-report.json and a11y-report.md next to package.json, and 200 % screenshots into
// screenshots-a11y/. Exit code 1 when any serious/critical axe violation or any manual failure remains.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = resolve(root, 'screenshots-a11y');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const SCALES = (opt('scales') ?? (flag('quick') ? '1' : '1,1.5,2')).split(',').map(Number);
const SCHEMES = (opt('schemes') ?? (flag('quick') ? 'light' : 'light,dark')).split(',');
const SHOTS = !flag('no-shots');
const VIEWPORT = { width: 360, height: 780 };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// A separate output dir: never clobber dist/ that another process may be using.
const dist = mkdtempSync(resolve(tmpdir(), 'sabitori-a11y-'));
if (!flag('no-build')) {
  execSync(`npx tsc --noEmit -p . && npx vite build --outDir ${JSON.stringify(dist)} --emptyOutDir`, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      // The optional features exist only when configured: switch them on so Settings shows every control.
      VITE_UPDATE_URL: 'https://updates.example.org/sabi',
      VITE_UPDATE_PUBLIC_KEY: `${'A'.repeat(43)}=`,
      VITE_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
    },
  });
}
if (SHOTS) { rmSync(shots, { recursive: true, force: true }); mkdirSync(shots, { recursive: true }); }

const PORT = await new Promise((res) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const base = `http://localhost:${PORT}/`;
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}

const BILL = "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 12 novembre 2026. Évitez la coupure. Service client: 677 00 12 34.";
const VAGUE = 'Bonjour. Passez nous voir quand vous pouvez, nous avons quelque chose pour vous. Merci.';
const PRACTICE = ['eneo', 'camwater', 'momo', 'prize', 'hospital', 'school'];
const SEED = { onboarded: true, lang: 'fr', listenFirst: false, speed: 0, retention: 30, region: 'CM', updatesOn: true, crashOn: false };

// ---------------------------------------------------------------- in-page checks (axe cannot do these)
/* eslint-disable */
function pageChecks({ minTarget, minGap }) {
  const out = [];
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const desc = (el) => {
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (c ? '.' + c : '') + ((el.textContent || '').trim().slice(0, 28) ? ` "${(el.textContent || '').trim().slice(0, 28)}"` : '');
  };
  const add = (type, el, detail) => out.push({ type, target: desc(el), detail });

  // inert background (modal open): only check what a user can reach
  const modal = document.querySelector('[role=dialog][aria-modal=true]');
  const scope = modal || document;

  // 1. touch targets: size and spacing
  const sel = 'button,a[href],input:not([type=hidden]),textarea,select,[role=button],[role=radio],[tabindex]:not([tabindex="-1"])';
  const targets = [...scope.querySelectorAll(sel)].filter((e) => vis(e) && !e.disabled);
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    if (r.width < minTarget - 0.5 || r.height < minTarget - 0.5) add('target-size', el, `${Math.round(r.width)}x${Math.round(r.height)}px, needs ${minTarget}`);
  }
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    if (a.contains(b) || b.contains(a)) continue;
    if (!!a.closest('.dock') !== !!b.closest('.dock')) continue; // content scrolls under the sticky dock by design
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const dx = Math.max(rb.left - ra.right, ra.left - rb.right, 0);
    const dy = Math.max(rb.top - ra.bottom, ra.top - rb.bottom, 0);
    const gap = Math.hypot(dx, dy);
    if (gap < minGap - 0.5) add('target-spacing', a, `${gap.toFixed(1)}px from ${desc(b)}, needs ${minGap}`);
  }

  // 2. accessible names that are raw keys / English-only section words
  for (const el of scope.querySelectorAll('[aria-label]')) {
    const v = el.getAttribute('aria-label') || '';
    if (/^(scam|sender|about|action|deadline|money|help|urgency)$/.test(v) || /^(ui|app)\.[a-z_.]+$/.test(v)) add('name-not-localised', el, `aria-label="${v}"`);
  }
  for (const el of targets) {
    const n = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim();
    if (!n && !(el.id && document.querySelector(`label[for="${el.id}"]`))) add('no-name', el, 'interactive element without a name');
  }

  // 3. horizontal overflow / clipping
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1) add('page-h-scroll', de, `scrollWidth ${de.scrollWidth} > ${innerWidth}`);
  for (const el of scope.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    if (el.closest('svg') || el.closest('.sr-only') || el.classList.contains('sr-only')) continue;
    const r = el.getBoundingClientRect();
    if (el.tagName !== 'HTML' && (r.right > innerWidth + 1 || r.left < -1) && !el.closest('.sr-only')) add('outside-viewport', el, `left ${Math.round(r.left)} right ${Math.round(r.right)}`);
    const cs = getComputedStyle(el);
    const clipsX = cs.overflowX !== 'visible', clipsY = cs.overflowY !== 'visible';
    const scroller = el.classList.contains('sheet') && (cs.overflowY === 'auto');
    if ((clipsX || clipsY) && !scroller && cs.overflowX !== 'auto' && cs.overflowY !== 'auto' && !el.classList.contains('sr-only')) {
      // really clipped = a descendant's box sticks out of this element's box (padding alone is not content)
      const er = el.getBoundingClientRect();
      for (const c of el.querySelectorAll('*')) {
        if (!vis(c) || c.closest('svg') || c.closest('.sr-only')) continue;
        const cr = c.getBoundingClientRect();
        if ((clipsX && (cr.right > er.right + 1 || cr.left < er.left - 1)) || (clipsY && (cr.bottom > er.bottom + 1))) { add('clipped', el, `${desc(c)} sticks out (${Math.round(cr.right - er.right)}px right, ${Math.round(cr.bottom - er.bottom)}px below)`); break; }
      }
    }
  }
  for (const el of scope.querySelectorAll('input')) if (vis(el) && el.scrollHeight > el.clientHeight + parseFloat(getComputedStyle(el).fontSize) * 0.25) add('clipped', el, `input text taller than the field (${el.scrollHeight} > ${el.clientHeight})`);
  // text that is taller than its fixed-height box
  for (const el of scope.querySelectorAll('.btn,.chip,.bar')) {
    if (!vis(el)) continue;
    if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflow !== 'visible') add('clipped', el, 'content taller than box');
  }

  // 4. overlap of the sticky dock with content at the end of the page, and of interactive elements
  const dock = document.querySelector('.dock');
  if (dock && !modal) {
    const dr = dock.getBoundingClientRect();
    const sc = document.scrollingElement;
    const atEnd = sc.scrollTop + innerHeight >= sc.scrollHeight - 2;
    if (atEnd) {
      const main = document.querySelector('.screen-body');
      const last = main && main.lastElementChild;
      if (last) { const lr = last.getBoundingClientRect(); if (lr.bottom > dr.top + 1) add('dock-overlap', last, `content bottom ${Math.round(lr.bottom)} > dock top ${Math.round(dr.top)}`); }
    }
    // the dock itself must not take most of the viewport
    if (dr.height > innerHeight * 0.55) add('dock-too-tall', dock, `${Math.round(dr.height)}px of ${innerHeight}px`);
  }
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    if (a.contains(b) || b.contains(a)) continue;
    if (!!a.closest('.dock') !== !!b.closest('.dock')) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) add('overlap', a, `overlaps ${desc(b)}`);
  }

  // 5. headings
  const hs = [...scope.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => !h.closest('[aria-hidden=true]'));
  const levels = hs.map((h) => +h.tagName[1]);
  if (!modal) {
    if (levels.filter((l) => l === 1).length !== 1) add('heading-h1', de, `${levels.filter((l) => l === 1).length} h1`);
    for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) add('heading-skip', hs[i], `h${levels[i - 1]} -> h${levels[i]}`);
    for (const h of hs) if (!(h.textContent || '').trim()) add('heading-empty', h, 'empty heading');
  }

  // 6. language
  if (!de.getAttribute('lang')) add('html-lang', de, 'no lang on <html>');
  return { problems: out, headings: hs.map((h) => `h${h.tagName[1]}:${(h.textContent || '').trim().slice(0, 40)}`), activeIsH1: document.activeElement && document.activeElement.tagName === 'H1' };
}
/* eslint-enable */

const TEXT_SPACING = 'html *{line-height:1.5 !important;letter-spacing:0.12em !important;word-spacing:0.16em !important} p{margin-bottom:2em !important}';

// ---------------------------------------------------------------- run
const report = { generatedAt: new Date().toISOString(), viewport: VIEWPORT, scales: SCALES, schemes: SCHEMES, states: [], axe: [], manual: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });

async function makePhotos() {
  const dir = mkdtempSync(resolve(tmpdir(), 'sabitori-a11y-photos-'));
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const html = (blur, body) => `<body style="margin:0;background:#f4f1ea;font:34px/1.5 Georgia,serif;color:#111;padding:60px;filter:blur(${blur}px)">${body}</body>`;
  const text = `<b>ENEO CAMEROON</b><br>Facture d'électricité<br>Montant à payer : 18 450 FCFA<br>Date limite de paiement : 12 novembre 2026<br>Veuillez régler votre facture avant cette date pour éviter la coupure.<br>Service client : 677 00 12 34`;
  await page.setContent(html(0, text)); await page.screenshot({ path: resolve(dir, 'sharp.png') });
  await page.setContent(html(7, text)); await page.screenshot({ path: resolve(dir, 'blur.png') });
  // sharp but no words: stripes
  await page.setContent(`<body style="margin:0;background:repeating-linear-gradient(90deg,#000 0 6px,#fff 6px 12px);width:900px;height:1100px"></body>`);
  await page.screenshot({ path: resolve(dir, 'empty.png') });
  await page.close();
  writeFileSync(resolve(dir, 'broken.png'), 'not an image');
  return dir;
}
const photos = await makePhotos();

async function newContext(scheme) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, colorScheme: scheme, serviceWorkers: 'block', deviceScaleFactor: 1, locale: 'fr-FR', reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => {
    // Headless Chromium has no voices: simulate a slow voice so the lit section is visible.
    let id;
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = (u) => { let i = 0; clearInterval(id); id = setInterval(() => { i += 3; u.onboundary?.({ charIndex: i }); if (i >= u.text.length) { clearInterval(id); u.onend?.(); } }, 400); };
      synth.cancel = () => clearInterval(id);
    }
  });
  return ctx;
}

for (const scheme of SCHEMES) for (const scale of SCALES) {
  const combo = `${scheme}-${Math.round(scale * 100)}`;
  const ctx = await newContext(scheme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => report.manual.push({ combo, state: '(page)', type: 'pageerror', target: '', detail: e.message }));
  const scaleCss = scale !== 1 ? `html{font-size:${scale * 100}% !important}` : '';
  let currentStyle = null;
  const go = async (hash, { lang } = {}) => {
    await page.goto('about:blank');
    await page.goto(base + hash);
    if (scaleCss) currentStyle = await page.addStyleTag({ content: scaleCss });
    await page.waitForSelector('h1', { state: 'attached' });
    await page.waitForTimeout(150);
  };
  const states = [];

  const audit = async (name, { text = true, shot = true, focus = true } = {}) => {
    await page.waitForTimeout(250);
    const modal = await page.locator('[role=dialog][aria-modal=true]').count();
    // axe
    let builder = new AxeBuilder({ page }).withTags(TAGS);
    const res = await builder.analyze();
    for (const v of res.violations) {
      report.axe.push({
        combo, state: name, id: v.id, impact: v.impact, help: v.help, tags: v.tags.filter((t) => t.startsWith('wcag') || t === 'best-practice'),
        nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), summary: (n.failureSummary || '').split('\n').slice(1, 3).join(' ').trim() })),
        count: v.nodes.length,
      });
    }
    // manual-class checks, with the page scrolled to its end (where the dock rests)
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    const m = await page.evaluate(pageChecks, { minTarget: 56, minGap: 8 });
    for (const p of m.problems) report.manual.push({ combo, state: name, ...p });
    if (focus && !modal && !m.activeIsH1 && !name.startsWith('capture') && !name.includes('playing') && !name.includes('armed') && !name.includes('sheet') && !name.includes('helper') && !name.includes('confirm'))
      report.manual.push({ combo, state: name, type: 'focus-not-on-title', target: '', detail: 'focus did not move to the screen title on arrival' });
    // text spacing (WCAG 1.4.12)
    if (text) {
      const sp = await page.addStyleTag({ content: TEXT_SPACING });
      await page.waitForTimeout(100);
      const t = await page.evaluate(pageChecks, { minTarget: 56, minGap: 8 });
      for (const p of t.problems.filter((p) => ['clipped', 'page-h-scroll', 'outside-viewport', 'overlap', 'dock-overlap'].includes(p.type))) report.manual.push({ combo, state: name, ...p, type: 'text-spacing:' + p.type });
      if (SHOTS && scale === 2 && shot && !modal) await page.screenshot({ path: resolve(shots, `${combo}-${name}-spacing.png`), fullPage: false });
      await sp.evaluate((el) => el.remove());
    }
    report.states.push({ combo, state: name, headings: m.headings, axeViolations: res.violations.length });
    if (SHOTS && scale === 2 && shot) {
      // full page, with the dock where it rests (as after scrolling to the end)
      const fix = modal ? null : await page.addStyleTag({ content: '.dock{position:static !important}' });
      await page.screenshot({ path: resolve(shots, `${combo}-${name}.png`), fullPage: !modal });
      if (fix) await fix.evaluate((el) => el.remove());
    }
    console.log(`  ${combo} ${name}: axe ${res.violations.length}`);
  };

  // ---- first run (no settings)
  await go('#/welcome');
  await audit('welcome-language');
  await page.goto(base + '#/mode'); await page.waitForSelector('h1'); await audit('welcome-mode');

  // ---- seeded
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify(s)), SEED);
  await go('#/');
  await audit('home-empty');

  for (const [text, who] of [[BILL, 'ENEO'], [VAGUE, '']]) {
    await go('#/paste');
    if (text === BILL) { await audit('paste-empty'); }
    await page.fill('#msg', text);
    if (who) {
      await page.getByRole('radio', { name: /nom/i }).click(); await page.fill('#who', who);
      await audit('paste-filled', { focus: false });
    }
    await page.locator('.dock .btn-primary').click();
    await page.waitForURL(/#\/card\//);
    await page.waitForSelector('.sec');
    if (text === BILL) {
      await audit('card-bill');
      await page.locator('.btn.fact').nth(1).click(); await page.waitForSelector('.sheet');
      await audit('card-source-sheet');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.sheet', { state: 'detached' });
    } else {
      await audit('card-facts-only');
    }
  }
  await go('#/'); await audit('home-history');
  await go('#/practice'); await audit('practice');
  for (const id of PRACTICE) {
    await go(`#/example/${id}`); await page.waitForSelector('.sec');
    await audit(`practice-${id}`);
    if (id === 'momo' || id === 'hospital') {
      await page.locator('.show-helper').click(); await page.waitForSelector('.sheet-full');
      await audit(`${id}-helper`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.sheet', { state: 'detached' });
    }
  }
  // lit section while speaking
  await go('#/example/momo'); await page.waitForSelector('.sec-scam');
  await page.locator('.dock .play-main').click(); await page.waitForSelector('.sec[data-active]');
  await audit('card-playing', { text: false });
  await page.locator('.dock .play-main').click().catch(() => undefined);

  // listen-first: first tap arms
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify({ ...s, listenFirst: true })), SEED);
  await go('#/example/eneo'); await page.waitForSelector('.sec');
  await page.locator('.show-helper').click();
  await page.waitForSelector('.sheet-full', { state: 'detached', timeout: 1500 }).catch(() => undefined);
  await audit('card-armed', { text: false });
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify(s)), SEED);

  // paste with a number sender
  await go('#/paste');
  await page.getByRole('radio', { name: /numéro/i }).click(); await audit('paste-number', { focus: false });

  // capture states
  for (const [file, wait, name] of [['blur.png', 700, 'capture-blurry'], ['empty.png', 5000, 'capture-empty'], ['broken.png', 1500, 'capture-error'], ['sharp.png', 600, 'capture-reading']]) {
    await go('#/');
    await page.locator('input[type=file]').setInputFiles(resolve(photos, file));
    await page.waitForSelector('.status');
    if (name === 'capture-reading') await page.waitForSelector('[role=progressbar]', { timeout: 15000 }).catch(() => undefined);
    else await page.waitForTimeout(wait);
    await audit(name, { text: name !== 'capture-reading' });
    if (name === 'capture-reading') await page.waitForURL(/#\/card\//, { timeout: 90000 }).catch(() => undefined);
  }

  // settings
  await go('#/settings'); await audit('settings');
  const del = page.getByRole('button', { name: /supprimer/i }).first();
  if (await del.count()) {
    await del.scrollIntoViewIfNeeded(); await del.click(); await page.waitForSelector('.sheet');
    await audit('settings-confirm-sheet');
    await page.keyboard.press('Escape');
  } else report.manual.push({ combo, state: 'settings', type: 'audit-gap', target: '', detail: 'confirmation sheet trigger not found' });

  // another language that falls back for some phrases (lang attributes)
  if (scale === 1 && scheme === 'light') {
    await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify({ ...s, lang: 'ewo' })), SEED);
    await go('#/example/eneo'); await page.waitForSelector('.sec');
    await audit('card-ewondo', { text: false });
    await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify(s)), SEED);
  }
  await ctx.close();
}

// ---------------------------------------------------------------- behaviours (real browser, light, 100 %)
{
  const fail = (state, type, detail) => report.manual.push({ combo: 'behaviour', state, type, target: '', detail });
  report.behaviours = [];
  const ok = (name, pass, detail = '') => { report.behaviours.push({ name, pass, detail }); if (!pass) fail(name, 'behaviour', detail); console.log(`  behaviour ${pass ? 'ok  ' : 'FAIL'} ${name} ${detail}`); };
  const ctx = await newContext('light');
  const page = await ctx.newPage();
  await page.goto(base + '#/welcome');
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify(s)), SEED);
  const go = async (hash) => { await page.goto('about:blank'); await page.goto(base + hash); await page.waitForSelector('h1', { state: 'attached' }); await page.waitForTimeout(200); };

  // lang on <html> follows the interface language
  await go('#/');
  ok('html lang is the interface language (fr)', (await page.evaluate(() => document.documentElement.lang)) === 'fr');

  // focus moves to the title on route change
  await page.locator('.dock button').nth(1).click();
  await page.waitForTimeout(300);
  ok('route change moves focus to the new title', await page.evaluate(() => location.hash.startsWith('#/paste') && document.activeElement?.tagName === 'H1'), await page.evaluate(() => location.hash));

  // every interactive element reachable by Tab shows a focus ring (>= 2px, not transparent)
  await go('#/example/eneo'); await page.waitForSelector('.sec');
  const bad = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { n: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), w: parseFloat(cs.outlineWidth), st: cs.outlineStyle, col: cs.outlineColor }; });
    if (r && (r.st === 'none' || r.w < 2)) bad.push(r.n);
  }
  ok('keyboard focus ring visible on every stop', bad.length === 0, bad.join(', '));

  // dialog: focus trap, Escape, restore, Back, inert background
  const fact = page.locator('.btn.fact').first();
  await fact.focus(); await page.keyboard.press('Enter'); await page.waitForSelector('[role=dialog]');
  ok('dialog takes focus', await page.evaluate(() => document.activeElement?.getAttribute('role') === 'dialog'));
  ok('dialog is named', !!(await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return document.getElementById(d.getAttribute('aria-labelledby'))?.textContent; })));
  ok('background is inert', await page.evaluate(() => document.getElementById('root').hasAttribute('inert')));
  let escaped = true;
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))) escaped = false; }
  ok('Tab stays inside the dialog', escaped);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+Tab'); if (!(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))) escaped = false; }
  ok('Shift+Tab stays inside the dialog', escaped);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok('Escape closes the dialog and restores focus to the opener', await page.evaluate(() => !document.querySelector('[role=dialog]') && document.activeElement?.classList.contains('fact')));
  await fact.focus(); await page.keyboard.press('Enter'); await page.waitForSelector('[role=dialog]');
  const hashBefore = await page.evaluate(() => location.hash);
  await page.goBack(); await page.waitForTimeout(300);
  ok('Back closes the dialog and stays on the card', await page.evaluate((h) => !document.querySelector('[role=dialog]') && location.hash === h, hashBefore));
  await fact.focus(); await page.keyboard.press('Enter'); await page.waitForSelector('[role=dialog]');
  await page.locator('[role=dialog] .btn').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok('Close button closes it and leaves no stray history entry', await page.evaluate((h) => !document.querySelector('[role=dialog]') && location.hash === h, hashBefore));

  // text that fell back to another language is marked with that language
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify({ ...s, lang: 'ewo' })), SEED);
  await go('#/example/eneo'); await page.waitForSelector('.sec');
  const fb = await page.evaluate(() => ({ notes: document.querySelectorAll('.fallback').length, marked: [...document.querySelectorAll('.card [lang]')].filter((e) => e.getAttribute('lang') !== document.documentElement.lang).length, html: document.documentElement.lang }));
  ok('fallback text carries its own lang (ewondo card)', fb.notes === 0 || fb.marked > 0, JSON.stringify(fb));
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify(s)), SEED);
  await go('#/example/eneo'); await page.waitForSelector('.sec');
  // sections: no raw English aria-labels; the lit section is aria-current, with no extra live region speaking over TTS
  ok('card has no aria-live region that could double the app speech', (await page.locator('.cardscreen [aria-live]:not([role=status])').count()) === 0);

  // listen-first: keyboard / assistive click acts immediately; a finger arms first
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify({ ...s, listenFirst: true })), SEED);
  await go('#/');
  const paste = page.locator('.dock button').nth(1);
  await paste.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok('listen-first: keyboard/AT activation acts at once (no second tap)', (await page.evaluate(() => location.hash)).startsWith('#/paste'));
  await go('#/');
  await page.locator('.dock button').nth(1).click(); await page.waitForTimeout(200);
  const armed = await page.evaluate(() => location.hash === '#/' && !!document.querySelector('[data-armed]'));
  ok('listen-first: a finger tap arms the button and says "tap again"', armed);
  await page.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify(s)), SEED);
  await ctx.close();

  // reduced motion: no transitions, no running animation, bar shows full
  const rctx = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block', locale: 'fr-FR', reducedMotion: 'reduce' });
  await rctx.addInitScript(() => { const synth = window.speechSynthesis; let id; if (synth) { synth.speak = (u) => { let i = 0; clearInterval(id); id = setInterval(() => { i += 3; u.onboundary?.({ charIndex: i }); if (i >= u.text.length) { clearInterval(id); u.onend?.(); } }, 400); }; synth.cancel = () => clearInterval(id); } });
  const rp = await rctx.newPage();
  await rp.goto(base + '#/welcome');
  await rp.evaluate((s) => localStorage.setItem('sabitori.settings.v1', JSON.stringify(s)), SEED);
  await rp.goto('about:blank'); await rp.goto(base + '#/example/momo'); await rp.waitForSelector('.sec-scam');
  await rp.locator('.dock .play-main').click(); await rp.waitForSelector('.sec[data-active]');
  const mo = await rp.evaluate(() => { const e = document.querySelector('.sec[data-active]'); const cs = getComputedStyle(e); const b = getComputedStyle(e, '::before'); return { tr: cs.transitionDuration, trb: b.transitionDuration, p: e.style.getPropertyValue('--p'), tf: b.transform }; });
  ok('reduced motion: no transitions and the bar shows full', /^0s(, 0s)*$/.test(mo.tr) && /^0s(, 0s)*$/.test(mo.trb) && mo.p === '1', JSON.stringify(mo));
  await rctx.close();
}

await browser.close();
server.kill();
rmSync(dist, { recursive: true, force: true });
rmSync(photos, { recursive: true, force: true });

// ---------------------------------------------------------------- report
const byRule = {};
for (const v of report.axe) {
  const k = `${v.id} (${v.impact ?? 'n/a'})`;
  (byRule[k] ??= { rule: v.id, impact: v.impact, help: v.help, occurrences: 0, states: new Set() });
  byRule[k].occurrences += 1; byRule[k].states.add(v.state);
}
const axeSummary = Object.values(byRule).map((r) => ({ ...r, states: [...r.states] })).sort((a, b) => b.occurrences - a.occurrences);
const manualBy = {};
for (const m of report.manual) { const k = m.type; (manualBy[k] ??= []).push(m); }
const seriousAxe = report.axe.filter((v) => v.impact === 'serious' || v.impact === 'critical');
report.summary = {
  stateRuns: report.states.length,
  axeViolations: report.axe.length,
  axeSeriousOrCritical: seriousAxe.length,
  axeByRule: axeSummary,
  manualFailures: report.manual.length,
  manualByType: Object.fromEntries(Object.entries(manualBy).map(([k, v]) => [k, v.length])),
};
writeFileSync(resolve(root, 'a11y-report.json'), JSON.stringify(report, null, 2));

const md = [];
md.push(`# Accessibility audit`, '', `Generated ${report.generatedAt}. ${report.states.length} screen-state runs at ${VIEWPORT.width}x${VIEWPORT.height}, font scales ${SCALES.map((s) => Math.round(s * 100) + '%').join('/')}, ${SCHEMES.join('+')}. axe-core tags: ${TAGS.join(', ')}.`, '');
md.push(`## axe-core`, '', `Violations: **${report.axe.length}** (serious/critical: **${seriousAxe.length}**).`, '');
if (axeSummary.length) {
  md.push('| Rule | Impact | Runs | Example states |', '| --- | --- | --- | --- |');
  for (const r of axeSummary) md.push(`| ${r.rule} | ${r.impact} | ${r.occurrences} | ${r.states.slice(0, 3).join(', ')} |`);
  md.push('');
}
md.push(`## Manual-class checks (targets, spacing, names, clipping, overlap, headings, focus, text spacing)`, '', `Failures: **${report.manual.length}**.`, '');
if (report.manual.length) {
  md.push('| Check | Count | Example |', '| --- | --- | --- |');
  for (const [k, v] of Object.entries(manualBy)) md.push(`| ${k} | ${v.length} | ${v[0].state}: ${v[0].target} ${v[0].detail} |`);
  md.push('');
}
md.push('Heading outline per screen is in a11y-report.json (`states[].headings`). Screenshots at 200 % are in screenshots-a11y/.', '');
writeFileSync(resolve(root, 'a11y-report.md'), md.join('\n'));
console.log(md.join('\n'));
process.exit(seriousAxe.length || report.manual.length ? 1 : 0);
