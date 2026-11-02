// @vitest-environment node
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadRgba, prepare } from './run';
import { VARIANT_SETS } from './variants';
import type { TruthEntry } from './generate';
it.skipIf(!process.env.OCR_DEBUG)('debug', async () => {
  const dir = resolve(__dirname, 'images');
  const entries = JSON.parse(readFileSync(resolve(dir, 'truth.json'), 'utf8')) as TruthEntry[];
  const out = process.env.OCR_DEBUG!;
  const vname = process.env.OCR_V ?? 'default';
  const v = VARIANT_SETS.smoke!.find((x) => x.name === vname)!;
  for (const e of entries) {
    const px = await loadRgba(resolve(dir, e.file));
    const p = prepare(px, v);
    const r = p.report!;
    console.log(e.id, `turn${e.turn}`, JSON.stringify({ o: r.orientation, skew: r.skew, scale: +r.scale.toFixed(2), lh: +r.lineHeight.toFixed(1), crop: r.cropped, wh: [r.width, r.height], ms: Math.round(p.prepMs) }));
    if (process.env.OCR_SAVE?.split(',').includes(e.id)) writeFileSync(`${out}/${e.id}.png`, p.png);
  }
}, 600000);
