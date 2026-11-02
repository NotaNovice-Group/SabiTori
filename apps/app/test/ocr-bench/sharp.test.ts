// @vitest-environment node
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadRgba } from './run';
import { rgbaToGrey, resize } from '../../src/lib/ocr-prep';
import { laplacianVariance, isSharp, SHARPNESS_SIZE } from '../../src/lib/sharpness';
import type { TruthEntry } from './generate';
/** Which benchmark photos would the capture screen already reject as blurry? */
it.skipIf(!process.env.OCR_SHARP)('sharpness of bench images', async () => {
  const dir = resolve(__dirname, 'images');
  const entries = JSON.parse(readFileSync(resolve(dir, 'truth.json'), 'utf8')) as TruthEntry[];
  const rows: string[] = [];
  for (const e of entries) {
    const px = await loadRgba(resolve(dir, e.file));
    const g0 = rgbaToGrey(px.data, px.width, px.height);
    const k = Math.min(1, SHARPNESS_SIZE / Math.max(g0.width, g0.height));
    const g = resize(g0, g0.width * k, g0.height * k);
    const v = laplacianVariance(Float32Array.from(g.data), g.width, g.height);
    rows.push(`${e.id} sev ${e.severity} var ${v.toFixed(0)} ${isSharp(v) ? '' : 'BLURRY'}`);
  }
  console.log('\n' + rows.join('\n'));
}, 120000);
