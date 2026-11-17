import { expect, test, type Page } from '@playwright/test';

/**
 * The main flows of the built app, end to end, in a real browser.
 * Speech is captured instead of played: headless Chromium has no voices, so `speechSynthesis.speak`
 * records each utterance and ends it at once. Tests assert on what would have been said, and in what order.
 */

const BILL =
  "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 12 novembre 2026. Évitez la coupure. Service client: 677 00 12 34.";
const VAGUE = 'Bonjour. Passez nous voir quand vous pouvez, nous avons quelque chose pour vous. Merci.';
const SEED = { onboarded: true, lang: 'fr', listenFirst: false, speed: 0, retention: 30, region: 'CM' };

declare global {
  interface Window { __spoken: string[] }
}

async function setup(page: Page, opts: { seed?: boolean } = {}) {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) external.push(r.url());
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((seed) => {
    window.__spoken = [];
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = (u: SpeechSynthesisUtterance) => {
        window.__spoken.push(u.text);
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 10);
      };
      synth.cancel = () => {};
    }
    // about:blank has no storage; only seed on the app's own pages
    if (seed && location.protocol.startsWith('http')) localStorage.setItem('sabitori.settings.v1', JSON.stringify(seed));
  }, opts.seed === false ? null : SEED);
  return { external, errors };
}

async function paste(page: Page, text: string) {
  await page.goto('#/paste');
  await page.fill('#msg', text);
  await page.locator('.dock .btn-primary').click();
  await page.waitForURL(/#\/card\//);
  await page.waitForSelector('.card .sec');
}

const sectionClasses = (page: Page) =>
  page.locator('.card .sec').evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith('sec-') && c !== 'sec-ic') ?? ''));

test('first run at the bare address shows the language screen', async ({ page }) => {
  const { errors } = await setup(page, { seed: false });
  await page.goto('');
  await expect(page.locator('.welcome')).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('a pasted bill becomes a full card with the amount, deadline and reference from the message', async ({ page }) => {
  const { errors, external } = await setup(page);
  await paste(page, BILL);
  const card = page.locator('.card');
  await expect(card).toHaveAttribute('data-mode', 'full');
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  expect(text).toMatch(/18[\s  .]?450/);
  expect(text).toMatch(/12/);
  expect(text.toLowerCase()).toMatch(/novembre/);
  // every fact on the card can show where it came from in the message
  const facts = page.locator('.btn.fact');
  expect(await facts.count()).toBeGreaterThan(0);
  await facts.first().click();
  await expect(page.locator('.sheet')).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('a vague message falls back to facts only, and never claims it is safe', async ({ page }) => {
  const { errors } = await setup(page);
  await paste(page, VAGUE);
  await expect(page.locator('.card')).toHaveAttribute('data-mode', 'facts_only');
  const text = (await page.locator('.card').innerText()).toLowerCase();
  // (\"si vous n'êtes pas sûr\" is fine; calling the message itself safe is not)
  expect(text).not.toMatch(/(message|il|ce|c'|est) (est )?(sûr|sans danger|fiable)|aucun danger|\bis safe\b/);
  expect(errors).toEqual([]);
});

for (const example of ['momo', 'prize']) {
  test(`scam example "${example}": the warning comes first on screen and first in speech`, async ({ page }) => {
    const { errors } = await setup(page);
    // Record which section is lit first when Listen is pressed. This does not depend on which voice speaks
    // (the phone's voice or a bundled Piper voice), so it holds in every build.
    await page.addInitScript(() => {
      const w = window as unknown as { __firstLit?: string };
      new MutationObserver(() => {
        if (w.__firstLit) return;
        const el = document.querySelector('.card .sec[data-active]');
        if (el) w.__firstLit = [...el.classList].find((c) => c.startsWith('sec-') && c !== 'sec-ic') ?? '';
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-active'], childList: true });
    });
    await page.goto(`#/example/${example}`);
    await page.waitForSelector('.card .sec-scam');
    await expect(page.locator('.card')).toHaveAttribute('data-scam', 'likely_scam');
    const order = await sectionClasses(page);
    expect(order[0]).toBe('sec-scam');
    // a likely scam never tells the person to pay
    expect(order).not.toContain('sec-money');

    await page.locator('.dock .play-main').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __firstLit?: string }).__firstLit ?? null), { timeout: 15_000 }).toBe('sec-scam');
    expect(errors).toEqual([]);
  });
}

test('works with the network switched off after the app has loaded', async ({ page, context }) => {
  const { errors } = await setup(page);
  // Load the app and its model once while online (on Android everything is inside the APK; on the web the
  // service worker keeps them), then cut the network.
  await paste(page, VAGUE);
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await paste(page, BILL);
  await expect(page.locator('.card')).toHaveAttribute('data-mode', 'full');
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('no screen makes a request to another host', async ({ page }) => {
  const { external, errors } = await setup(page);
  for (const hash of ['#/', '#/paste', '#/practice', '#/example/hospital', '#/settings', '#/about']) {
    await page.goto('about:blank');
    await page.goto(hash);
    await page.waitForSelector('h1', { state: 'attached' });
    await page.waitForTimeout(300);
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('a card can be deleted and is gone from history', async ({ page }) => {
  await setup(page);
  await paste(page, BILL);
  const url = page.url();
  page.on('dialog', (d) => d.accept());
  await page.locator('.danger-quiet').click();
  // listen-first is off, so one tap acts; a confirm step may follow
  const confirm = page.locator('.sheet .btn-primary, .sheet .danger');
  if (await confirm.count()) await confirm.first().click();
  // Deleting ends on the home screen. Wait until the card screen is really gone: jumping back to the card's
  // address before the app has drawn the home screen would leave the old screen up (same address, no change).
  await page.waitForURL((u) => !u.hash.startsWith('#/card/'));
  await expect(page.locator('.card')).toHaveCount(0);
  await page.goto(url.slice(url.indexOf('#')));
  // The card route shows "not found" or, if the card still exists, the card: wait for either, then say which.
  await page.locator('.note, .card').first().waitFor({ timeout: 15_000 });
  const seen = await page.evaluate(() => ({ hash: location.hash, title: document.querySelector('h1')?.textContent ?? '', card: !!document.querySelector('.card') }));
  expect(seen.card, JSON.stringify(seen)).toBe(false);
  await expect(page.locator('.note')).toBeVisible();
});

test('when the model cannot download (first web visit, network lost), the rules answer quietly', async ({ page }) => {
  const { errors } = await setup(page);
  await page.route('**/ort/*.wasm', (r) => r.abort('internetdisconnected'));
  await paste(page, BILL);
  await expect(page.locator('.card')).toHaveAttribute('data-mode', 'full');
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('"Remind me" on the web downloads a calendar file for the deadline', async ({ page }) => {
  await setup(page);
  await paste(page, BILL);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.group-actions button').first().click()]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const ics = readFileSync(path!, 'utf8');
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toMatch(/DTSTART[^:\r\n]*:20261112/);
});

test('a photo of a bill is read on the device and becomes a card', async ({ page, browser }) => {
  test.slow(); // OCR in a headless browser takes tens of seconds
  const { errors, external } = await setup(page);
  // Render a clear photo of a bill to feed the camera input.
  const shooter = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  await shooter.setContent(
    '<body style="margin:0;background:#f4f1ea;font:34px/1.5 Georgia,serif;color:#111;padding:60px"><b>ENEO CAMEROON</b><br>Facture d\'électricité<br>Montant à payer : 18 450 FCFA<br>Date limite de paiement : 12 novembre 2026<br>Service client : 677 00 12 34</body>',
  );
  const photo = await shooter.screenshot({ type: 'png' });
  await shooter.close();
  await page.goto('#/');
  await page.waitForSelector('h1', { state: 'attached' });
  await page.locator('input[type=file]').first().setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: photo });
  await page.waitForURL(/#\/card\//, { timeout: 120_000 });
  await page.waitForSelector('.card .sec');
  const text = (await page.locator('.card').innerText()).replace(/\s+/g, ' ');
  expect(text).toMatch(/18[\s  .]?450/);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('a store build has no pilot counter', async ({ page }) => {
  await setup(page);
  await page.goto('#/settings');
  await page.waitForSelector('h1', { state: 'attached' });
  await expect(page.locator('#s-pilot')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sabitori.pilot.v1'))).toBeNull();
});

test('a store build has no optional LLM: no model option and no wllama file', async ({ page, request }) => {
  await setup(page);
  await page.goto('#/settings');
  await page.waitForSelector('h1', { state: 'attached' });
  await expect(page.locator('#s-model')).toHaveCount(0);
  const r = await request.get('wllama/wllama.wasm');
  expect(r.ok() && (r.headers()['content-type'] ?? '').includes('wasm')).toBe(false);
});
