// Card correctness on the 30 OCR-benchmark photos: not only "were the facts read" (RESULTS.md) but "does the card a
// person sees show the right amount and the right date". Rules path, the shipped OCR text of each photo, and the
// same photo's true text for comparison. Deterministic: writes apps/app/test/ocr-bench/results/cards.json.
//
//   node node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs packages/understand/eval/run-photo-cards.mjs
//
// Expected values are the first amount and first date of each photo's truth (the amount due and the deadline);
// mobile-money receipts have no deadline, so their date is not scored.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../core/src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const region = json('regions/CM/region.json');
const lexicons = ['fr', 'en'].map((t) => json(`packs/${t}/reading.json`));
const bench = 'apps/app/test/ocr-bench';
const truth = json(`${bench}/images/truth.json`);
const shipped = json(`${bench}/results/rules.json`).find((v) => v.name.startsWith('shipped'));
const RECEIVED = '2026-10-31';

const score = async (text) => {
  const c = await analyze({ text, source: 'photo', receivedAt: RECEIVED, region: 'CM' }, { region, lexicons });
  return { amount: c.amount?.value.amount, date: c.deadline?.value, scam: c.scam.level };
};
const tally = () => ({ right: 0, wrong: 0, missing: 0 });
const add = (t, got, want) => (got === want ? t.right++ : got === undefined ? t.missing++ : t.wrong++);

const out = { photos: shipped.images.length, ocr: { amount: tally(), date: tally(), falseScam: 0 }, truth: { amount: tally(), date: tally(), falseScam: 0 }, dated: 0, pages: [] };
for (const im of shipped.images) {
  const e = truth.find((x) => x.id === im.id);
  const dated = e.kind !== 'momo';
  if (dated) out.dated++;
  const row = { id: im.id };
  for (const [key, text] of [['ocr', im.text], ['truth', e.text]]) {
    const s = await score(text);
    add(out[key].amount, s.amount, e.must.amounts[0]);
    if (dated) add(out[key].date, s.date, e.must.dates[0]);
    if (s.scam === 'likely_scam') out[key].falseScam++;
    row[key] = s;
  }
  out.pages.push(row);
}
writeFileSync(join(root, bench, 'results/cards.json'), JSON.stringify(out, null, 1) + '\n');
const f = (t, n) => `${t.right}/${n} right, ${t.wrong} wrong, ${t.missing} not shown`;
console.log(`Photo cards (OCR text): amount ${f(out.ocr.amount, out.photos)}; date ${f(out.ocr.date, out.dated)}; likely-scam on a genuine photo: ${out.ocr.falseScam}`);
console.log(`Same photos, true text: amount ${f(out.truth.amount, out.photos)}; date ${f(out.truth.date, out.dated)}`);
