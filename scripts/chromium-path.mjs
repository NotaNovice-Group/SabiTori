/**
 * Which Chromium the repository's browser scripts launch: $CHROMIUM when set, else a preinstalled browser at
 * /opt/pw-browsers/chromium if there is one (cloud development containers), else undefined, which makes
 * Playwright use the browser it installed itself (`npx playwright install chromium`).
 */
import { existsSync } from 'node:fs';

const PREINSTALLED = '/opt/pw-browsers/chromium';

export function chromiumPath() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return existsSync(PREINSTALLED) ? PREINSTALLED : undefined;
}
