// @vitest-environment node
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { generateAll } from './generate';

/** OCR_BENCH_GEN=1 pnpm --filter @sabitori/app exec vitest run test/ocr-bench/gen.test.ts */
describe.skipIf(!process.env.OCR_BENCH_GEN)('generate OCR benchmark images', () => {
  it('writes images and truth.json', async () => {
    const t = await generateAll(resolve(__dirname, 'images'));
    console.log(`generated ${t.length} images`);
  }, 300_000);
});
