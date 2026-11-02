#!/usr/bin/env node
/**
 * Evaluate the on-device encoder classifier (MiniLM int8 + heads) against the rules baseline.
 *
 *   node packages/understand/eval/run-encoder.mjs                    # TEST split -> results-encoder.md
 *   node packages/understand/eval/run-encoder.mjs --select-threshold # pick the threshold on TRAIN (out-of-fold), prints it
 *   node packages/understand/eval/run-encoder.mjs --threshold 0.7    # override
 *   --data <jsonl> --model <dir> --split test|train --out <md>
 *
 * The threshold is chosen only from train-split out-of-fold predictions (model/minilm/oof.json),
 * never from the test split.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const flag = (n) => process.argv.includes(n);
const dataPath = resolve(arg('--data', resolve(here, 'messages.jsonl')));
const modelDir = resolve(arg('--model', resolve(here, '../model/minilm')));
const split = arg('--split', 'test');
const outPath = resolve(arg('--out', resolve(here, 'results-encoder.md')));

const { createServer } = await import(createRequire(resolve(repo, 'apps/app/package.json')).resolve('vite'));
const server = await createServer({ root: repo, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
const core = await server.ssrLoadModule(resolve(repo, 'packages/core/src/index.ts'));
const und = await server.ssrLoadModule(resolve(repo, 'packages/understand/src/index.ts'));

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const region = readJson(resolve(repo, 'regions/CM/region.json'));
const lexicons = ['fr', 'en'].map((t) => readJson(resolve(repo, `packs/${t}/reading.json`)));
const rules = core.createRulesClassifier(region, lexicons);
const FIELDS = ['kind', 'action', 'urgency'];
const rows = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const pct = (x) => (100 * x).toFixed(1) + '%';

const SOURCE = { sms: 'paste', whatsapp: 'share', letter: 'photo' };
/** Same input the rules baseline (run-rules.mjs) sees: text, source, receivedAt and sender of the row. */
async function rulesFor(r) {
  const input = { text: r.text, source: SOURCE[r.source] ?? 'paste', receivedAt: r.receivedAt ?? '2026-10-31', region: 'CM', ...(r.sender ? { sender: r.sender } : {}) };
  const facts = core.extractFacts(r.text, { region, lexicons, receivedAt: input.receivedAt });
  return { input, facts, u: await rules.classify(input, facts) };
}

/**
 * Per-field threshold selection from out-of-fold train predictions: for each field, the threshold
 * (or 1.01 = never use the encoder for this field) that maximises accuracy of "encoder if sure, else rules".
 * Among thresholds within 0.5 point of the best, the middle one is taken (robust, not an edge). Never looks at the test split.
 */
async function selectThresholds() {
  const oof = readJson(resolve(modelDir, 'oof.json'));
  const rr = [];
  for (const m of oof.rows) rr.push((await rulesFor(m)).u);
  const grid = [];
  for (let t = 0.3; t < 0.96; t += 0.05) grid.push(+t.toFixed(2));
  grid.push(1.01);
  const best = {};
  const table = {};
  for (const f of FIELDS) {
    const o = oof.fields[f];
    table[f] = grid.map((t) => {
      let ok = 0;
      for (let i = 0; i < o.gold.length; i++) ok += (o.conf[i] >= t ? o.pred[i] : rr[i][f]) === o.gold[i] ? 1 : 0;
      return { t, acc: ok / o.gold.length };
    });
    const top = Math.max(...table[f].map((r) => r.acc));
    const plateau = table[f].filter((r) => r.acc >= top - 0.005); // all within half a point of the best
    best[f] = plateau[Math.floor((plateau.length - 1) / 2)]; // middle of the plateau, not its edge
  }
  return { best, table };
}

if (flag('--select-threshold')) {
  const { best, table } = await selectThresholds();
  for (const f of FIELDS) console.log(`${f.padEnd(8)} ${table[f].map((r) => `${r.t}:${(100 * r.acc).toFixed(1)}`).join('  ')}`);
  const thresholds = Object.fromEntries(FIELDS.map((f) => [f, best[f].t]));
  console.log('BEST thresholds (train, out-of-fold):', JSON.stringify(thresholds), FIELDS.map((f) => `${f} ${pct(best[f].acc)}`).join(', '));
  if (flag('--write')) {
    const hp = resolve(modelDir, 'heads.json');
    const h = readJson(hp);
    h.thresholds = thresholds;
    writeFileSync(hp, JSON.stringify(h));
    console.log('wrote thresholds to', hp);
  }
  await server.close();
  process.exit(0);
}

if (!existsSync(dataPath)) { console.error(`no dataset at ${dataPath}`); process.exit(2); }
const fs = await import('node:fs/promises');
const override = arg('--threshold', null);
const threshold = override === null ? readJson(resolve(modelDir, 'heads.json')).thresholds ?? und.DEFAULT_ENCODER_THRESHOLD : Number(override);
const cls = await und.createEncoderClassifier({
  baseUrl: modelDir, fallback: rules, threshold,
  readFile: async (n) => new Uint8Array(await fs.readFile(resolve(modelDir, n))),
});
const data = rows(dataPath).filter((r) => r.split === split);
const encOnly = await und.createEncoderClassifier({ baseUrl: modelDir, fallback: rules, threshold: 0, readFile: async (n) => new Uint8Array(await fs.readFile(resolve(modelDir, n))) });

const sys = { rules: {}, encoder: {}, combined: {} };
for (const s of Object.values(sys)) for (const f of [...FIELDS, 'all']) s[f] = 0;
const fails = [];
const byLang = {};
const lat = [];
const usedEnc = { kind: 0, action: 0, urgency: 0 };
const conf = { combined: [], okC: [], badC: [] };
for (const r of data) {
  const { input, facts, u } = await rulesFor(r);
  const t0 = performance.now();
  const c = await cls.classify(input, facts);
  lat.push(performance.now() - t0);
  const e = await encOnly.classify(input, facts);
  const score = (name, x) => {
    let all = true;
    for (const f of FIELDS) { const ok = x[f] === r.expected[f]; if (ok) sys[name][f]++; else all = false; }
    if (all) sys[name].all++;
  };
  score('rules', u); score('encoder', e); score('combined', c);
  const L = (byLang[r.lang ?? '?'] ??= { n: 0, rules: [0, 0, 0], combined: [0, 0, 0] });
  L.n++;
  FIELDS.forEach((f, i) => { L.rules[i] += u[f] === r.expected[f] ? 1 : 0; L.combined[i] += c[f] === r.expected[f] ? 1 : 0; });
  for (const f of FIELDS) if (c[f] !== u[f]) usedEnc[f]++;
  if (FIELDS.some((f) => c[f] !== r.expected[f])) fails.push({ text: r.text, exp: r.expected, got: c, rules: u });
}
const n = data.length;
lat.sort((a, b) => a - b);
const row = (name, label) => `| ${label} | ${[...FIELDS, 'all'].map((f) => pct(sys[name][f] / n)).join(' | ')} |`;
const md = [
  `# Encoder classifier results (${split} split, n=${n})`,
  '',
  `Classifier: \`${cls.id}\`, confidence thresholds ${JSON.stringify(threshold)} (chosen on the train split, out-of-fold; the test split was not used for any choice).`,
  '',
  '| System | kind | action | urgency | all three |',
  '| --- | --- | --- | --- | --- |',
  row('rules', 'rules@1 (baseline)'),
  row('encoder', 'encoder alone (threshold 0)'),
  row('combined', `**encoder + rules (default)**`),
  '',
  `Fields where the combined answer differs from rules: kind ${usedEnc.kind}, action ${usedEnc.action}, urgency ${usedEnc.urgency} of ${n}.`,
  '',
  `Node latency (onnxruntime-web wasm, this machine): median ${lat[Math.floor(n / 2)]?.toFixed(0)} ms, p95 ${lat[Math.floor(n * 0.95)]?.toFixed(0)} ms per message.`,
  '',
  '## By message language (rules -> encoder + rules)',
  '',
  '| Lang | n | kind | action | urgency |',
  '| --- | --- | --- | --- | --- |',
  ...Object.entries(byLang).map(([l, v]) => `| ${l} | ${v.n} | ${[0, 1, 2].map((i) => `${pct(v.rules[i] / v.n)} -> ${pct(v.combined[i] / v.n)}`).join(' | ')} |`),
  '',
  'Pidgin (`wes`) rows were written without a native speaker: a smoke test only (see eval/README.md).',
  '',
  '## Combined errors (first 25)',
  '',
  ...fails.slice(0, 25).map((f) => `- "${f.text.slice(0, 110).replace(/\n/g, ' ')}" expected ${FIELDS.map((k) => f.exp[k]).join('/')} got ${FIELDS.map((k) => f.got[k]).join('/')} (conf ${f.got.confidence}, rules ${FIELDS.map((k) => f.rules[k]).join('/')})`),
  '',
].join('\n');
writeFileSync(outPath, md);
console.log(md);
await server.close();
