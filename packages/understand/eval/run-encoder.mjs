#!/usr/bin/env node
/**
 * Evaluate the on-device encoder classifier (MiniLM int8 + heads) against the rules baseline, on the
 * TEST split of messages.jsonl and on the UNSEEN set (unseen.jsonl), with 95% bootstrap intervals,
 * paired McNemar tests and calibration. This script is the single source of the published numbers:
 *
 *   node packages/understand/eval/run-encoder.mjs                    # -> results.json + results-encoder.md
 *   node packages/understand/eval/run-encoder.mjs --select-threshold # pick thresholds on TRAIN (out-of-fold), print
 *   node packages/understand/eval/run-encoder.mjs --select-threshold --write   # ...and store them in heads.json
 *   --model <dir> --data <jsonl> --unseen <jsonl> --json <file> --out <md>   (experiments; defaults are the shipped files)
 *
 * Thresholds are chosen only from train-split out-of-fold predictions (model/minilm/oof.json). The test
 * split and the unseen set are never used for any choice. No timing is written: latency depends on the
 * machine; see packages/understand/harness/ (headless Chromium, 4x CPU throttle, main thread).
 * Then run `node packages/understand/eval/model-card.mjs` to regenerate the tables in model-card.md,
 * README.md and docs/model.md from results.json.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accuracyCI, paired, calibration, fmtCI, fmtDiff, SEED, RESAMPLES } from './stats.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const flag = (n) => process.argv.includes(n);
const dataPath = resolve(arg('--data', resolve(here, 'messages.jsonl')));
const unseenPath = resolve(arg('--unseen', resolve(here, 'unseen.jsonl')));
// A second, later unseen set (written by an independent author after a retrain); evaluated when the file exists.
const unseen2Path = resolve(arg('--unseen2', resolve(here, 'unseen2.jsonl')));
const unseen3Path = resolve(arg('--unseen3', resolve(here, 'unseen3.jsonl')));
const modelDir = resolve(arg('--model', resolve(here, '../model/minilm')));
const outPath = resolve(arg('--out', resolve(here, 'results-encoder.md')));
const jsonPath = resolve(arg('--json', resolve(here, 'results.json')));

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
const fs = await import('node:fs/promises');
const readFile = async (n) => new Uint8Array(await fs.readFile(resolve(modelDir, n)));

const SOURCE = { sms: 'paste', whatsapp: 'share', letter: 'photo' };
/** Same input the rules baseline (run-rules.mjs) sees: text, source, receivedAt and sender of the row. */
async function rulesFor(r) {
  const input = { text: r.text, source: SOURCE[r.source] ?? 'paste', receivedAt: r.receivedAt ?? '2026-10-31', region: 'CM', ...(r.sender ? { sender: r.sender } : {}) };
  const facts = core.extractFacts(r.text, { region, lexicons, receivedAt: input.receivedAt });
  return { input, facts, u: await rules.classify(input, facts) };
}

const GRID = [...Array.from({ length: 14 }, (_, i) => +(0.3 + 0.05 * i).toFixed(2)), 1.01];
const NEVER = Object.fromEntries(FIELDS.map((f) => [f, 1.01]));

/**
 * Per-field threshold grid on out-of-fold train predictions, through the app's own combination code
 * (`combineWithRules`): for each field and threshold t (1.01 = never use the encoder for this field),
 * the accuracy of that field. Chosen: the middle of the plateau within half a point of the best (robust,
 * not an edge). Never looks at the test split or the unseen set.
 */
async function thresholdGrid() {
  const oof = readJson(resolve(modelDir, 'oof.json'));
  const rr = [];
  const ctx = [];
  const enc0 = await und.loadEncoder({ baseUrl: modelDir, readFile });
  for (const m of oof.rows) {
    const { input, facts, u } = await rulesFor(m);
    rr.push(u);
    ctx.push({ facts, receivedAt: input.receivedAt, truncated: enc0.isTruncated?.(m.text) ?? false, cues: rules.urgencyCues(input, facts) });
  }
  const head = (f, i) => ({ label: oof.fields[f].pred[i], p: oof.fields[f].conf[i], probs: oof.fields[f].probs?.[i] ?? [] });
  const table = {};
  const best = {};
  for (const f of FIELDS) {
    table[f] = GRID.map((t) => {
      let ok = 0;
      for (let i = 0; i < rr.length; i++) {
        const enc = Object.fromEntries(FIELDS.map((g) => [g, head(g, i)]));
        // Fields in order (kind, action, urgency), each with the thresholds already chosen: urgency follows the chosen action.
        const c = und.combineWithRules(enc, rr[i], { ...NEVER, ...Object.fromEntries(Object.entries(best).map(([g, b]) => [g, b.t])), [f]: t }, 'oof', ctx[i]); // same guard as the app
        ok += c[f] === oof.fields[f].gold[i] ? 1 : 0;
      }
      return { t, acc: +(ok / rr.length).toFixed(4) };
    });
    const top = Math.max(...table[f].map((r) => r.acc));
    const plateau = table[f].filter((r) => r.acc >= top - 0.005);
    best[f] = plateau[Math.floor((plateau.length - 1) / 2)];
  }
  const chosen = Object.fromEntries(FIELDS.map((f) => [f, best[f].t]));
  let all = 0;
  for (let i = 0; i < rr.length; i++) {
    const enc = Object.fromEntries(FIELDS.map((g) => [g, head(g, i)]));
    const c = und.combineWithRules(enc, rr[i], chosen, 'oof', ctx[i]);
    all += FIELDS.every((f) => c[f] === oof.fields[f].gold[i]) ? 1 : 0;
  }
  return { n: rr.length, best, table, allThree: all / rr.length };
}

if (flag('--select-threshold')) {
  const { best, table, allThree } = await thresholdGrid();
  for (const f of FIELDS) console.log(`${f.padEnd(8)} ${table[f].map((r) => `${r.t}:${(100 * r.acc).toFixed(1)}`).join('  ')}`);
  const thresholds = Object.fromEntries(FIELDS.map((f) => [f, best[f].t]));
  console.log('BEST thresholds (train, out-of-fold):', JSON.stringify(thresholds), FIELDS.map((f) => `${f} ${pct(best[f].acc)}`).join(', '));
  console.log(`all three right (train, out-of-fold, combined): ${pct(allThree)}`);
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

for (const p of [dataPath, unseenPath]) if (!existsSync(p)) { console.error(`no dataset at ${p}`); process.exit(2); }
const heads = readJson(resolve(modelDir, 'heads.json'));
const threshold = heads.thresholds ?? und.DEFAULT_ENCODER_THRESHOLD;
const cls = await und.createEncoderClassifier({ baseUrl: modelDir, fallback: rules, threshold, readFile });
const enc = await und.loadEncoder({ baseUrl: modelDir, readFile });

/** One evaluated row: gold, rules, encoder alone (argmax + probability), combined, scam level. */
async function evalRow(r) {
  const { input, facts, u } = await rulesFor(r);
  const c = await cls.classify(input, facts);
  const h = und.applyHeads(await enc.embed(r.text), enc.heads);
  const scam = core.assessScam(input, facts, region, lexicons).level;
  return {
    id: r.id, lang: r.lang, source: r.source, gold: r.expected, goldScam: r.scam, scam,
    rules: Object.fromEntries(FIELDS.map((f) => [f, u[f]])),
    encoder: Object.fromEntries(FIELDS.map((f) => [f, h[f].label])),
    encoderP: Object.fromEntries(FIELDS.map((f) => [f, +h[f].p.toFixed(4)])),
    combined: Object.fromEntries(FIELDS.map((f) => [f, c[f]])),
    combinedConfidence: c.confidence,
  };
}

const SYSTEMS = ['rules', 'encoder', 'combined'];
const okOf = (rs, sys, f) => rs.map((x) => (f === 'all' ? FIELDS.every((g) => x[sys][g] === x.gold[g]) : x[sys][f] === x.gold[f]) ? 1 : 0);

function summarise(rs) {
  const acc = {};
  for (const s of SYSTEMS) acc[s] = Object.fromEntries([...FIELDS, 'all'].map((f) => [f, accuracyCI(okOf(rs, s, f))]));
  const vsRules = {};
  for (const s of ['combined', 'encoder']) vsRules[s] = Object.fromEntries([...FIELDS, 'all'].map((f) => [f, paired(okOf(rs, s, f), okOf(rs, 'rules', f))]));
  const byLang = {};
  for (const l of ['fr', 'en', 'wes']) {
    const sub = rs.filter((x) => x.lang === l);
    if (!sub.length) continue;
    byLang[l] = { n: sub.length, ...Object.fromEntries(['rules', 'combined'].map((s) => [s, Object.fromEntries([...FIELDS, 'all'].map((f) => [f, accuracyCI(okOf(sub, s, f))]))])) };
    byLang[l].combinedVsRules = paired(okOf(sub, 'combined', 'all'), okOf(sub, 'rules', 'all'));
  }
  const calib = Object.fromEntries(FIELDS.map((f) => [f, calibration(rs.map((x) => x.encoderP[f]), okOf(rs, 'encoder', f))]));
  const scam = accuracyCI(rs.map((x) => (x.scam === x.goldScam ? 1 : 0)));
  const flagged = rs.filter((x) => x.goldScam !== 'no_signs');
  const genuine = rs.filter((x) => x.goldScam === 'no_signs');
  return {
    n: rs.length, accuracy: acc, vsRules, byLang, calibration: calib,
    scam: { level: scam, warned: flagged.filter((x) => x.scam !== 'no_signs').length, flagged: flagged.length, falseAlarms: genuine.filter((x) => x.scam !== 'no_signs').length, genuine: genuine.length },
    changedFromRules: Object.fromEntries(FIELDS.map((f) => [f, rs.filter((x) => x.combined[f] !== x.rules[f]).length])),
  };
}

const sets = {
  test: rows(dataPath).filter((r) => r.split === 'test'),
  unseen: rows(unseenPath).filter((r) => r.split === 'unseen'),
  ...(existsSync(unseen2Path) ? { unseen2: rows(unseen2Path).filter((r) => r.split === 'unseen') } : {}),
  ...(existsSync(unseen3Path) ? { unseen3: rows(unseen3Path).filter((r) => r.split === 'unseen') } : {}),
};
const evaluated = {};
for (const [name, rs] of Object.entries(sets)) {
  evaluated[name] = [];
  for (const r of rs) evaluated[name].push(await evalRow(r));
}
const grid = await thresholdGrid();
const info = existsSync(resolve(modelDir, 'export-info.json')) ? readJson(resolve(modelDir, 'export-info.json')) : {};
const trainReport = existsSync(resolve(modelDir, 'train-report.json')) ? readJson(resolve(modelDir, 'train-report.json')) : {};
const results = {
  generatedBy: 'packages/understand/eval/run-encoder.mjs',
  classifier: cls.id,
  model: relative(repo, modelDir),
  thresholds: threshold,
  stats: { ci: '95% percentile bootstrap over rows', resamples: RESAMPLES, seed: SEED, test: 'exact two-sided McNemar on discordant pairs', alpha: 0.05, ece: '10 equal-width bins, encoder heads alone, argmax probability' },
  export: { onnxBytes: info.onnx_bytes, keptVocab: info.kept_vocab, fill: info.fill ?? 'score', exportedParams: info.exported_params, sourceParams: info.source_params, fidelity: info.cosine_vs_original },
  train: { n: trainReport.n_train, cv: trainReport.cv },
  thresholdGrid: grid,
  sets: Object.fromEntries(Object.entries(evaluated).map(([k, rs]) => [k, summarise(rs)])),
  rows: evaluated,
};
writeFileSync(jsonPath, JSON.stringify(results, null, 1) + '\n');

// ---- markdown --------------------------------------------------------------------------------
const S = results.sets;
const LABEL = { rules: 'rules@1 (baseline)', encoder: 'encoder alone', combined: '**encoder + rules (default)**' };
const accTable = (s) => [
  '| System | kind | action | urgency | all three |',
  '| --- | --- | --- | --- | --- |',
  ...SYSTEMS.map((sys) => `| ${LABEL[sys]} | ${[...FIELDS, 'all'].map((f) => fmtCI(s.accuracy[sys][f])).join(' | ')} |`),
];
const pairTable = (s) => [
  '| Comparison | kind | action | urgency | all three |',
  '| --- | --- | --- | --- | --- |',
  ...['combined', 'encoder'].map((sys) => `| ${sys === 'combined' ? 'encoder + rules' : 'encoder alone'} vs rules | ${[...FIELDS, 'all'].map((f) => fmtDiff(s.vsRules[sys][f]) + (s.vsRules[sys][f].significant ? ' *' : '')).join(' | ')} |`),
];
const langTable = (s) => [
  '| Lang | n | rules, all three | encoder + rules, all three | difference |',
  '| --- | --- | --- | --- | --- |',
  ...Object.entries(s.byLang).map(([l, v]) => `| ${l} | ${v.n} | ${fmtCI(v.rules.all)} | ${fmtCI(v.combined.all)} | ${fmtDiff(v.combinedVsRules)}${v.combinedVsRules.significant ? ' *' : ''} |`),
];
const calTable = (s) => [
  '| Head | ECE | mean confidence | accuracy |',
  '| --- | --- | --- | --- |',
  ...FIELDS.map((f) => `| ${f} | ${s.calibration[f].ece.toFixed(3)} | ${s.calibration[f].meanConf.toFixed(2)} | ${s.calibration[f].acc.toFixed(2)} |`),
];
const section = (name, title) => {
  const s = S[name];
  return [
    `## ${title} (n=${s.n})`,
    '',
    ...accTable(s),
    '',
    'Paired difference against rules on the same messages: points, 95% bootstrap interval, messages only the first system gets right vs only rules gets right, exact McNemar p. `*` = significant at 0.05.',
    '',
    ...pairTable(s),
    '',
    `Scam level (assessScam, code; the same for every system): ${fmtCI(s.scam.level)}; a warning on ${s.scam.warned}/${s.scam.flagged} scam or caution messages; false alarms on ${s.scam.falseAlarms}/${s.scam.genuine} messages with no signs.`,
    '',
    `Fields where encoder + rules differs from rules: kind ${s.changedFromRules.kind}, action ${s.changedFromRules.action}, urgency ${s.changedFromRules.urgency} of ${s.n}.`,
    '',
    '### By language (all three labels right)',
    '',
    ...langTable(s),
    '',
    '### Calibration of the encoder heads (alone)',
    '',
    ...calTable(s),
    '',
  ];
};
const md = [
  '# Encoder classifier results',
  '',
  `Generated by \`eval/run-encoder.mjs\` (machine-readable copy: \`eval/results.json\`; do not edit by hand). Classifier \`${cls.id}\`, thresholds ${JSON.stringify(threshold)}, chosen on the train split out-of-fold (n=${grid.n}); the test split and the unseen set were not used for any choice.`,
  `Intervals: 95% percentile bootstrap, ${RESAMPLES} resamples, seed ${SEED}. Latency is not measured here (see \`packages/understand/harness/README.md\`).`,
  '',
  ...section('test', 'Test split of messages.jsonl (generator templates)'),
  ...section('unseen', 'Unseen set, unseen.jsonl (written to avoid the generator templates)'),
  ...(S.unseen2 ? section('unseen2', 'Second unseen set, unseen2.jsonl (independent author, written after the retrain, evaluated once)') : []),
  ...(S.unseen3 ? section('unseen3', 'Third unseen set, unseen3.jsonl (independent author and label reviewer, written before the fine-tuned model was trained, never read during training, evaluated once)') : []),
  '## Threshold grid (train, out-of-fold; field accuracy when the encoder is used at or above t)',
  '',
  `| Field | ${GRID.map((t) => (t > 1 ? 'never' : t.toFixed(2))).join(' | ')} | chosen |`,
  `| --- | ${GRID.map(() => '---').join(' | ')} | --- |`,
  ...FIELDS.map((f) => `| ${f} | ${grid.table[f].map((r) => (100 * r.acc).toFixed(1)).join(' | ')} | ${grid.best[f].t} |`),
  '',
  'Pidgin (`wes`) rows were written without a native speaker: a smoke test only (see eval/README.md).',
  '',
  '## Encoder + rules errors on the test split (first 25)',
  '',
  ...evaluated.test.filter((x) => FIELDS.some((f) => x.combined[f] !== x.gold[f])).slice(0, 25).map((x) => `- ${x.id}: expected ${FIELDS.map((k) => x.gold[k]).join('/')} got ${FIELDS.map((k) => x.combined[k]).join('/')} (rules ${FIELDS.map((k) => x.rules[k]).join('/')})`),
  '',
].join('\n');
writeFileSync(outPath, md);
console.log(md);
await server.close();
