/**
 * Draft rows for messages.real.jsonl from real, consented messages (README, "Adding real, consented, anonymised
 * messages"). Run from the repository root, on the computer of the person who collected the consent:
 *
 *   VN=$(ls -d node_modules/.pnpm/vite-node@*\/node_modules/vite-node/vite-node.mjs | head -1)
 *   node $VN packages/understand/eval/anonymise.ts <raw.txt> <draft.jsonl> --lang fr --source sms --received 2026-11-20
 *
 * <raw.txt>: one message per block, blocks separated by a blank line. Keep it off the repository and delete it
 * when the drafts are checked. <draft.jsonl>: anonymised text, with empty labels and a `review` list (what was
 * changed, words that may be names). Two people check every row, a native speaker fills `expected` and `scam`,
 * then the `review` field is removed and the row moves to messages.real.jsonl. Nothing is sent anywhere.
 */
import { randomInt } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anonymise } from './anonymise-lib';

const root = resolve(__dirname, '../../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const [inPath, outPath, ...rest] = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? rest[i + 1]! : dflt;
};
if (!inPath || !outPath) {
  console.error('Usage: anonymise.ts <raw.txt> <draft.jsonl> [--lang fr|en|wes] [--source sms|whatsapp|letter] [--received YYYY-MM-DD]');
  process.exit(1);
}
if (resolve(outPath).endsWith('messages.real.jsonl')) {
  console.error('Write drafts to another file: rows reach messages.real.jsonl only after two people have checked them.');
  process.exit(1);
}
if (existsSync(outPath)) {
  console.error(`${outPath} exists; choose a new file.`);
  process.exit(1);
}
const lang = opt('lang', 'fr');
const source = opt('source', 'sms');
const receivedAt = opt('received', new Date().toISOString().slice(0, 10));
const ctx = { region: json('regions/CM/region.json'), lexicons: ['fr', 'en'].map((t) => json(`packs/${t}/reading.json`)), receivedAt };
const rand = () => randomInt(0, 1_000_000) / 1_000_000;

const blocks = readFileSync(inPath, 'utf8').split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
const rows = blocks.map((raw, i) => {
  const a = anonymise(raw, ctx, rand);
  return {
    id: `real-draft-${String(i + 1).padStart(3, '0')}`,
    lang,
    source,
    text: a.text,
    receivedAt,
    // Who sent it matters for scam signals: the reviewer writes the sender as the phone showed it (a name such as
    // "MTN MoMo", or a number, anonymised like the text).
    sender: { kind: 'unknown' },
    synthetic: false,
    split: 'test',
    expected: null,
    scam: null,
    review: { changed: a.changed.map((c) => `${c.kind}: ${c.to}`), mayBeNames: a.check },
  };
});
writeFileSync(outPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const names = rows.reduce((n, r) => n + r.review.mayBeNames.length, 0);
console.log(`${rows.length} draft rows in ${outPath}. ${rows.reduce((n, r) => n + r.review.changed.length, 0)} numbers changed; ${names} words to check for names.`);
console.log('Next: two people check every row (names, places, anything that identifies someone), then label it.');
