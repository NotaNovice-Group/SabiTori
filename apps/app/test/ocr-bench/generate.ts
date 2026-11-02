/** Generates the benchmark images (JPEG) and truth.json. Deterministic: same seeds, same documents. */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES, plan, type Rendered } from './docs';
import { degrade, paramsFor, turnJpeg } from './degrade';

export interface TruthEntry extends Pick<Rendered, 'kind' | 'lang' | 'text' | 'must'> {
  id: string;
  file: string;
  severity: number;
  turn: number;
}

export async function generateAll(dir: string): Promise<TruthEntry[]> {
  mkdirSync(dir, { recursive: true });
  const truth: TruthEntry[] = [];
  for (const d of plan()) {
    const tpl = TEMPLATES[d.kind];
    const probe = createCanvas(1240, 1754);
    // render once to learn the page size (momo is a phone screen, not A4)
    const rendered = tpl(probe.getContext('2d'), d.seed, d.lang);
    const page = createCanvas(rendered.width, rendered.height);
    tpl(page.getContext('2d'), d.seed, d.lang);
    const params = paramsFor(d.severity, d.seed, d.kind === 'momo');
    let jpg = await degrade(page, params, d.seed);
    if (d.turn) jpg = await turnJpeg(jpg, d.turn, params.jpeg);
    const file = `${d.id}.jpg`;
    writeFileSync(join(dir, file), jpg);
    truth.push({ id: d.id, file, kind: d.kind, lang: d.lang, text: rendered.text, must: rendered.must, severity: Math.round(d.severity * 100) / 100, turn: d.turn ?? 0 });
  }
  writeFileSync(join(dir, 'truth.json'), JSON.stringify(truth, null, 1));
  return truth;
}
