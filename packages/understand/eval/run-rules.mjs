// Rules-baseline evaluation on the test split of messages.jsonl.
//
// Run from the repository root (vite-node transpiles the TypeScript sources of @sabitori/core on the fly):
//   node node_modules/.pnpm/vite-node@3.2.4/node_modules/vite-node/vite-node.mjs packages/understand/eval/run-rules.mjs
// Options: --split=test|train|all (default test)   --no-write (print only, do not write results-rules.md)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assessScam, createRulesClassifier, extractFacts } from '../../core/src/index.ts';
import { evaluate } from '../src/evaluate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const region = json('regions/CM/region.json');
const lexicons = [json('packs/fr/reading.json'), json('packs/en/reading.json')];

const arg = (name, dflt) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).split('=')[1];
const splitArg = arg('split', 'test');
const write = !process.argv.includes('--no-write');

const rows = readFileSync(join(here, 'messages.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((r) => splitArg === 'all' || r.split === splitArg);

const SOURCE = { sms: 'paste', letter: 'photo', whatsapp: 'share' };
const toInput = (r) => ({ text: r.text, source: SOURCE[r.source], receivedAt: r.receivedAt, region: 'CM', sender: r.sender });
const factsOf = (r) => extractFacts(r.text, { region, lexicons, receivedAt: r.receivedAt });

const pct = (x) => (x * 100).toFixed(1) + '%';
const classifier = createRulesClassifier(region, lexicons);

async function evalRows(subset) {
  return evaluate(
    classifier,
    subset.map((r) => ({ id: r.id, input: toInput(r), facts: factsOf(r), expected: r.expected })),
  );
}

const SCAM_LEVELS = ['likely_scam', 'caution', 'no_signs'];
function scamEval(subset) {
  const m = Object.fromEntries(SCAM_LEVELS.map((e) => [e, Object.fromEntries(SCAM_LEVELS.map((p) => [p, 0]))]));
  const wrong = [];
  let ok = 0;
  for (const r of subset) {
    const got = assessScam(toInput(r), factsOf(r), region, lexicons).level;
    m[r.scam][got]++;
    if (got === r.scam) ok++;
    else wrong.push({ id: r.id, expected: r.scam, got, text: r.text });
  }
  return { m, wrong, acc: subset.length ? ok / subset.length : 0 };
}

const topConfusions = (conf, n = 8) =>
  Object.entries(conf)
    .flatMap(([e, row]) => Object.entries(row).filter(([p]) => p !== e).map(([p, c]) => ({ e, p, c })))
    .sort((a, b) => b.c - a.c || a.e.localeCompare(b.e) || a.p.localeCompare(b.p))
    .slice(0, n);

const out = [];
const P = (s = '') => out.push(s);

const rep = await evalRows(rows);
const scam = scamEval(rows);

P('# Rules baseline results');
P();
P(`Classifier: \`${classifier.id}\` (region CM, lexicons fr + en, no \`wes\` lexicon exists yet). Split: \`${splitArg}\` (${rows.length} messages).`);
P('Regenerate: see the header of `run-rules.mjs`. Deterministic: same dataset gives the same numbers.');
P();
P('## Accuracy');
P();
P('| Field | Accuracy |');
P('|---|---|');
for (const f of ['kind', 'action', 'urgency']) P(`| ${f} | ${pct(rep.accuracy[f])} |`);
P(`| all three right | ${pct(rep.accuracyAll)} |`);
P(`| scam level (assessScam) | ${pct(scam.acc)} |`);
P();
P(`Mean rules confidence: ${rep.meanConfidence.toFixed(2)}. Classifier errors: ${rep.errors}.`);
P();

P('## By language');
P();
P('| Lang | n | kind | action | urgency | all three | scam level |');
P('|---|---|---|---|---|---|---|');
for (const lang of ['fr', 'en', 'wes']) {
  const sub = rows.filter((r) => r.lang === lang);
  if (!sub.length) continue;
  const r = await evalRows(sub);
  const s = scamEval(sub);
  P(`| ${lang} | ${sub.length} | ${pct(r.accuracy.kind)} | ${pct(r.accuracy.action)} | ${pct(r.accuracy.urgency)} | ${pct(r.accuracyAll)} | ${pct(s.acc)} |`);
}
P();

P('## Scam level confusion (rows = expected, columns = predicted)');
P();
P(`| expected \\ predicted | ${SCAM_LEVELS.join(' | ')} | recall |`);
P(`|---|${SCAM_LEVELS.map(() => '---').join('|')}|---|`);
for (const e of SCAM_LEVELS) {
  const tot = SCAM_LEVELS.reduce((a, p) => a + scam.m[e][p], 0);
  P(`| ${e} | ${SCAM_LEVELS.map((p) => scam.m[e][p]).join(' | ')} | ${tot ? pct(scam.m[e][e] / tot) : 'n/a'} |`);
}
const scamish = rows.filter((r) => r.scam !== 'no_signs').length;
const flagged = rows.filter((r) => r.scam !== 'no_signs');
let caught = 0;
for (const r of flagged) if (assessScam(toInput(r), factsOf(r), region, lexicons).level !== 'no_signs') caught++;
let falseAlarms = 0;
const genuine = rows.filter((r) => r.scam === 'no_signs');
for (const r of genuine) if (assessScam(toInput(r), factsOf(r), region, lexicons).level !== 'no_signs') falseAlarms++;
P();
P(`Any warning on scam/caution messages: ${caught}/${scamish} (${pct(scamish ? caught / scamish : 0)}). Warning on no-signs messages (false alarms): ${falseAlarms}/${genuine.length} (${pct(genuine.length ? falseAlarms / genuine.length : 0)}).`);
P();

P('## Confusion summary (most frequent errors, expected -> predicted)');
for (const f of ['kind', 'action', 'urgency']) {
  P();
  P(`### ${f}`);
  P();
  const top = topConfusions(rep.confusion[f]);
  if (!top.length) P('No errors.');
  else for (const t of top) P(`- ${t.e} -> ${t.p}: ${t.c}`);
}
P();
P('### scam level');
P();
const sc = topConfusions(scam.m, 6);
if (!sc.length) P('No errors.');
else for (const t of sc) P(`- ${t.e} -> ${t.p}: ${t.c}`);
P();

P('## Per-label recall');
for (const f of ['kind', 'action', 'urgency']) {
  P();
  P(`### ${f}`);
  P();
  P('| Label | n | recall |');
  P('|---|---|---|');
  for (const [e, row] of Object.entries(rep.confusion[f]).sort()) {
    const n = Object.values(row).reduce((a, b) => a + b, 0);
    P(`| ${e} | ${n} | ${pct((row[e] ?? 0) / n)} |`);
  }
}
P();

if (splitArg !== 'all') {
  const all = JSON.parse(JSON.stringify(rep.accuracy));
  const full = await evalRows(readFileSync(join(here, 'messages.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  P('## For reference: all 320 messages');
  P();
  P(`kind ${pct(full.accuracy.kind)}, action ${pct(full.accuracy.action)}, urgency ${pct(full.accuracy.urgency)}, all three ${pct(full.accuracyAll)} (rules need no training, so train and test are comparable).`);
  void all;
}

const text = out.join('\n') + '\n';
console.log(text);
if (write && splitArg === 'test') writeFileSync(join(here, 'results-rules.md'), text);
