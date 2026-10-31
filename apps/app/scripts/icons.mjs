// Renders public/icons/*.png from the mark. Run once; the PNGs are committed.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/icons');
mkdirSync(out, { recursive: true });

const mark = (stroke, w) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${w}" height="${w}" fill="none" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 5h17l9 9v29H8z"/><path d="M25 5v9h9"/><path d="M14 25h14M14 32h9"/>
  <path d="M39 22.5a7 7 0 0 1 0 9"/><path d="M43.5 17.5a13.5 13.5 0 0 1 0 19"/></svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
for (const [name, size, scale] of [['icon-192', 192, 0.62], ['icon-512', 512, 0.62], ['icon-maskable-512', 512, 0.5]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size * scale);
  await page.setContent(`<body style="margin:0;background:#EEF0EC;display:grid;place-items:center;width:${size}px;height:${size}px">${mark('#121A16', inner)}</body>`);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  await page.close();
}
await browser.close();
