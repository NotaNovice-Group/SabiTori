// Renders the legacy (Android < 8) launcher PNGs from the SabiTori mark. Adaptive icons, the splash
// and the notification icon are vector drawables in android/app/src/main/res and need no rendering.
// Run once after changing the mark: `node scripts/android-icons.mjs`. The PNGs are committed.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from './chromium-path.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(resolve(here, '../apps/app/package.json'))('@playwright/test');
const res = resolve(here, '../apps/app/android/app/src/main/res');
const GROUND = '#0D5C4C';

const mark = (w) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="13.5 5 80 80" width="${w}" height="${w}"><g transform="translate(-4 3)"><path d="M26 28C26 42 40 42 40 50C40 58 26 58 26 72L70 72C70 58 56 58 56 50C56 42 70 42 70 28Z" fill="#FFFCF6"/><ellipse cx="48" cy="72" rx="22" ry="7" fill="#FFFCF6"/><path d="M34 34L45 50L34 66M48 36L48 65M62 34L51 50L62 66" fill="none" stroke="#0D5C4C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="48" cy="28" rx="22" ry="7" fill="#F0A43A"/><path d="M72 14a9 9 0 0 1 8 8" fill="none" stroke="#F0A43A" stroke-width="3.6" stroke-linecap="round"/><path d="M74 5a17 17 0 0 1 15 15" fill="none" stroke="#F0A43A" stroke-width="3.6" stroke-linecap="round"/></g></svg>`;

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const browser = await chromium.launch({ executablePath: chromiumPath() });
for (const [d, size] of Object.entries(densities)) {
  const dir = resolve(res, `mipmap-${d}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, radius] of [['ic_launcher', '22%'], ['ic_launcher_round', '50%']]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;border-radius:${radius};background:${GROUND};display:grid;place-items:center">${mark(Math.round(size * 0.7))}</div></body>`,
    );
    await page.screenshot({ path: resolve(dir, `${name}.png`), omitBackground: true });
    await page.close();
  }
}
await browser.close();
console.log('wrote legacy launcher icons');
