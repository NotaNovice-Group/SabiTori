// Renders public/icons/*.png from the mark. Run once; the PNGs are committed.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from '../../../scripts/chromium-path.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/icons');
mkdirSync(out, { recursive: true });

const mark = (w) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="13.5 5 80 80" width="${w}" height="${w}"><g transform="translate(-4 3)"><path d="M26 28C26 42 40 42 40 50C40 58 26 58 26 72L70 72C70 58 56 58 56 50C56 42 70 42 70 28Z" fill="#FFFCF6"/><ellipse cx="48" cy="72" rx="22" ry="7" fill="#FFFCF6"/><path d="M34 34L45 50L34 66M48 36L48 65M62 34L51 50L62 66" fill="none" stroke="#0D5C4C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="48" cy="28" rx="22" ry="7" fill="#F0A43A"/><path d="M72 14a9 9 0 0 1 8 8" fill="none" stroke="#F0A43A" stroke-width="3.6" stroke-linecap="round"/><path d="M74 5a17 17 0 0 1 15 15" fill="none" stroke="#F0A43A" stroke-width="3.6" stroke-linecap="round"/></g></svg>`;

const browser = await chromium.launch({ executablePath: chromiumPath() });
for (const [name, size, scale] of [['icon-192', 192, 0.72], ['icon-512', 512, 0.72], ['icon-maskable-512', 512, 0.56]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size * scale);
  await page.setContent(`<body style="margin:0;background:#0D5C4C;display:grid;place-items:center;width:${size}px;height:${size}px">${mark(inner)}</body>`);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  await page.close();
}
await browser.close();
