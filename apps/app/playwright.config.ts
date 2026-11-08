import { defineConfig } from '@playwright/test';

// End-to-end tests against the production build (`pnpm build` first): `pnpm e2e`.
// CHROMIUM may point at a preinstalled browser; otherwise Playwright's own Chromium is used.
const PORT = Number(process.env.E2E_PORT ?? 4317);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: 'fr-FR',
    serviceWorkers: 'block',
    viewport: { width: 360, height: 780 },
    launchOptions: process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
