// @vitest-environment node
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OFF, VARIANT_SETS } from './variants';
import { runVariant, loadRgba, type VariantResult } from './run';
import type { TruthEntry } from './generate';

/**
 * OCR_BENCH=<set> [OCR_PAR=3] pnpm --filter @sabitori/app exec vitest run test/ocr-bench/bench.test.ts
 * Sets are defined in variants.ts. Results land in results/<set>.json.
 */
const set = process.env.OCR_BENCH;
describe.skipIf(!set)('OCR benchmark', () => {
  it(`runs set ${set}`, async () => {
    const dir = resolve(__dirname, 'images');
    const entries = JSON.parse(readFileSync(resolve(dir, 'truth.json'), 'utf8')) as TruthEntry[];
    const variants = VARIANT_SETS[set!];
    if (!variants) throw new Error(`unknown set ${set}; have ${Object.keys(VARIANT_SETS).join(', ')}`);
    const par = Number(process.env.OCR_PAR ?? 3);
    const only = process.env.OCR_ONLY?.split(',');
    const cache = new Map<string, Awaited<ReturnType<typeof loadRgba>>>();
    const out: VariantResult[] = [];
    for (const v of variants) {
      if (only && !only.includes(v.name)) continue;
      const t0 = Date.now();
      const r = await runVariant(v, entries, dir, par, cache);
      out.push(r);
      console.log(`${r.name.padEnd(34)} CER ${(r.cer * 100).toFixed(1)}%  facts R ${(r.recall * 100).toFixed(1)} P ${(r.precision * 100).toFixed(1)} F1 ${(r.f1 * 100).toFixed(1)}  perfect ${r.perfect}/${r.images.length}  prep ${r.prepMs.toFixed(0)}ms ocr ${r.ocrMs.toFixed(0)}ms  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      writeFileSync(resolve(__dirname, `results/${set}.json`), JSON.stringify(out));
    }
    void OFF;
  }, 3_600_000);
});
