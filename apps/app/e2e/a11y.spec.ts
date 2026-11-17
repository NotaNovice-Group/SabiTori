import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Accessibility of every screen of the built app, in a real browser: axe-core (WCAG 2.1 A and AA rules,
 * colour contrast included) in the light and the dark theme, and a 200% text check on a small phone
 * (nothing may need sideways scrolling). Speech is stubbed as in flows.spec.ts.
 */

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const SEED = { onboarded: true, lang: 'fr', listenFirst: false, speed: 0, retention: 30, region: 'CM' };
const BILL =
  "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 12 novembre 2026. Évitez la coupure. Service client: 677 00 12 34.";

// The app's CSP forbids inline scripts; only this test lifts it, to inject axe.
test.use({ bypassCSP: true });

interface AxeViolation { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }

async function setup(page: Page, seed: boolean) {
  await page.addInitScript((s) => {
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = (u: SpeechSynthesisUtterance) => void setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 10);
      synth.cancel = () => {};
    }
    if (s && location.protocol.startsWith('http')) localStorage.setItem('sabitori.settings.v1', JSON.stringify(s));
  }, seed ? SEED : null);
}

async function audit(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: unknown[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
    return r.violations;
  }) as AxeViolation[];
  return violations.map((v) => `${v.impact ?? '?'} ${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
}

const SCREENS: { name: string; go: (p: Page) => Promise<void>; seed?: boolean }[] = [
  { name: 'welcome', seed: false, go: async (p) => { await p.goto(''); await p.waitForSelector('.welcome'); } },
  { name: 'home', go: async (p) => { await p.goto('#/'); await p.waitForSelector('h1', { state: 'attached' }); } },
  { name: 'paste', go: async (p) => { await p.goto('#/paste'); await p.waitForSelector('#msg'); } },
  { name: 'practice', go: async (p) => { await p.goto('#/practice'); await p.waitForSelector('h1', { state: 'attached' }); } },
  { name: 'scam card', go: async (p) => { await p.goto('#/example/momo'); await p.waitForSelector('.card .sec-scam'); } },
  {
    name: 'bill card',
    go: async (p) => {
      await p.goto('#/paste');
      await p.fill('#msg', BILL);
      await p.locator('.dock .btn-primary').click();
      await p.waitForSelector('.card .sec');
    },
  },
  { name: 'settings', go: async (p) => { await p.goto('#/settings'); await p.waitForSelector('h1', { state: 'attached' }); } },
  { name: 'about', go: async (p) => { await p.goto('#/about'); await p.waitForSelector('h1', { state: 'attached' }); } },
];

for (const scheme of ['light', 'dark'] as const) {
  for (const s of SCREENS) {
    test(`${s.name} (${scheme}): no WCAG 2.1 AA violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await setup(page, s.seed !== false);
      await s.go(page);
      await page.waitForTimeout(300);
      expect(await audit(page)).toEqual([]);
    });
  }
}

for (const s of SCREENS) {
  test(`${s.name}: text at 200% on a 320 px phone needs no sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await setup(page, s.seed !== false);
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '200%'; });
    });
    await s.go(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
