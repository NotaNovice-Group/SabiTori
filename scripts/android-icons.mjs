// Renders the legacy (Android < 8) launcher PNGs from the SabiTori mark. Adaptive icons, the splash
// and the notification icon are vector drawables in android/app/src/main/res and need no rendering.
// Run once after changing the mark: `node scripts/android-icons.mjs`. The PNGs are committed.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(resolve(here, '../apps/app/package.json'))('@playwright/test');
const res = resolve(here, '../apps/app/android/app/src/main/res');
const GROUND = '#EEF0EC';
const INK = '#121A16';

const mark = (w) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="6 3 43 43" width="${w}" height="${w}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 5h17l9 9v29H8z"/><path d="M25 5v9h9"/><path d="M14 25h14M14 32h9"/>
  <path d="M39 22.5a7 7 0 0 1 0 9"/><path d="M43.5 17.5a13.5 13.5 0 0 1 0 19"/></svg>`;

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
for (const [d, size] of Object.entries(densities)) {
  const dir = resolve(res, `mipmap-${d}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, radius] of [['ic_launcher', '22%'], ['ic_launcher_round', '50%']]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;border-radius:${radius};background:${GROUND};display:grid;place-items:center">${mark(Math.round(size * 0.58))}</div></body>`,
    );
    await page.screenshot({ path: resolve(dir, `${name}.png`), omitBackground: true });
    await page.close();
  }
}
await browser.close();
console.log('wrote legacy launcher icons');
