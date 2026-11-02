// @vitest-environment node
// Review 3: dark-mode screenshots (R4 #4) and the capped half-turn retry (R5).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyze, createRulesClassifier, type ReadingLexicon, type RegionConfig } from '@sabitori/core';
import { isLightOnDark, preprocessGrey, rgbaToGrey, PREP_DEFAULT, type GreyImage } from '../src/lib/ocr-prep';
import { recogniseGrey, tidy, type Recogniser } from '../src/lib/ocr';
import { loadRgba, makeWorker, toPng, factKeys } from './ocr-bench/run';

const root = resolve(__dirname, '../../..');
const json = <T>(p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8')) as T;
const region = json<RegionConfig>('regions/CM/region.json');
const lexicons = ['fr', 'en'].map((t) => json<ReadingLexicon>(`packs/${t}/reading.json`));
const SCREENS = resolve(__dirname, 'ocr-bench/screens');

async function grey(file: string): Promise<GreyImage> {
  const px = await loadRgba(resolve(SCREENS, file));
  return rgbaToGrey(px.data, px.width, px.height);
}

describe('dark-mode detection at working resolution', () => {
  it('flags the reviewer dark screenshots (with and without a message bubble), not the light one', async () => {
    expect(isLightOnDark(await grey('sms-dark.png'))).toBe(true);
    expect(isLightOnDark(await grey('sms-dark-nobubble.png'))).toBe(true);
    expect(isLightOnDark(await grey('sms-light.png'))).toBe(false);
  });
  it('a photographed paper page (bench image) is not inverted', async () => {
    const px = await loadRgba(resolve(__dirname, 'ocr-bench/images/01-eneo-fr.jpg'));
    expect(isLightOnDark(rgbaToGrey(px.data, px.width, px.height))).toBe(false);
  });
});

describe('the dark SMS reads like the light one (real OCR, fra+eng, the app pipeline)', () => {
  it('finds the whole phone number, the amount, and a likely scam', async () => {
    const w = await makeWorker(['fra', 'eng']);
    try {
      const out: Record<string, { text: string; scam: string; phones: string[]; amount?: number }> = {};
      for (const f of ['sms-light.png', 'sms-dark.png']) {
        const { image } = preprocessGrey(await grey(f), PREP_DEFAULT);
        const text = tidy((await recogniseGrey(w as never, image, toPng)).text);
        const card = await analyze({ text, source: 'photo', receivedAt: '2026-11-02', region: 'CM' }, { region, lexicons, classifier: createRulesClassifier(region, lexicons) });
        out[f] = { text, scam: card.scam.level, phones: card.facts.phones.map((p) => p.value), amount: card.amount?.value.amount ?? card.facts.amounts[0]?.value.amount };
      }
      for (const f of ['sms-light.png', 'sms-dark.png']) {
        expect(out[f]!.phones, f).toContain('+237650556677');
        expect(out[f]!.amount, f).toBe(25000);
        expect(out[f]!.scam, f).toBe('likely_scam');
      }
    } finally {
      await w.terminate();
    }
  }, 120_000);
});

describe('half-turn retry is spent only where it can help', () => {
  const fake = (conf: number[], texts: string[]): Recogniser & { calls: number } => {
    const r = {
      calls: 0,
      async recognize() {
        const i = r.calls++;
        return { data: { text: texts[i] ?? '', confidence: conf[i] ?? 0 } };
      },
    };
    return r;
  };
  const g: GreyImage = { data: new Uint8ClampedArray(4), width: 2, height: 2 };
  const count = (t: string) => factKeys(t).size;
  const FACTS = 'Montant 18 450 FCFA. Date limite 12 novembre 2026. Appelez le 677 00 12 34.';
  it('a confident page: one pass', async () => {
    const w = fake([80], [FACTS]);
    expect((await recogniseGrey(w, g, (x) => x, { countFacts: count })).passes).toBe(1);
  });
  it('unsure (40..55) but its facts were read: one pass', async () => {
    const w = fake([48], [FACTS]);
    expect((await recogniseGrey(w, g, (x) => x, { countFacts: count })).passes).toBe(1);
  });
  it('unsure and almost no facts: the half turn is tried, and kept when clearly better', async () => {
    const w = fake([48, 85], ['xx', FACTS]);
    const r = await recogniseGrey(w, g, (x) => x, { countFacts: count });
    expect(r).toMatchObject({ passes: 2, turned: true, text: FACTS });
  });
  it('very unsure (< 40): always tried', async () => {
    const w = fake([30, 31], [FACTS, 'y']);
    const r = await recogniseGrey(w, g, (x) => x, { countFacts: count });
    expect(r).toMatchObject({ passes: 2, turned: false, text: FACTS });
  });
  it('without a fact counter, the old rule (every page under 55)', async () => {
    const w = fake([48, 10], [FACTS, '']);
    expect((await recogniseGrey(w, g, (x) => x)).passes).toBe(2);
  });
});
