// Renders the published evaluation numbers from results.json into marked blocks of the docs:
//
//   <!-- results:NAME -->
//   ...generated...
//   <!-- /results:NAME -->
//
// Used by model-card.mjs (writes the files) and by test/model-card.test.ts (checks the files are
// up to date), so every number a reader sees comes from one file: eval/results.json.
import { fmtCI, fmtDiff, fmtP } from './stats.mjs';

const FIELDS = ['kind', 'action', 'urgency', 'all'];
const NAME = { kind: 'kind', action: 'action', urgency: 'urgency', all: 'all three' };
const SYS = { rules: 'rules@1 (keyword rules)', encoder: 'encoder alone', combined: '**encoder + rules (default)**' };
const SET = { test: 'test split', unseen: 'unseen set', unseen2: 'second unseen set' };
const setsOf = (r) => ['test', 'unseen', ...(r.sets.unseen2 ? ['unseen2'] : [])];

/** Files that carry blocks, relative to the repository root, and the blocks each must contain. */
export const DOCS = {
  'README.md': ['headline'],
  'docs/model.md': ['model-summary'],
  'packages/understand/model/minilm/model-card.md': ['card-export', 'card-eval', 'card-calibration'],
  'packages/understand/eval/README.md': ['eval-summary'],
};

const pct1 = (x) => `${(100 * x).toFixed(1)}%`;
const verdict = (d) => (d.significant ? `higher (${fmtP(d.p)})` : `not significantly different (${fmtP(d.p)})`);

function evalTable(r) {
  const out = ['| Set | System | kind | action | urgency | all three |', '| --- | --- | --- | --- | --- | --- |'];
  for (const set of setsOf(r)) {
    const s = r.sets[set];
    for (const sys of ['rules', 'encoder', 'combined']) out.push(`| ${SET[set]} (n=${s.n}) | ${SYS[sys]} | ${FIELDS.map((f) => fmtCI(s.accuracy[sys][f])).join(' | ')} |`);
  }
  return out;
}

function pairTable(r) {
  const out = ['| Set | Comparison | kind | action | urgency | all three |', '| --- | --- | --- | --- | --- | --- |'];
  for (const set of setsOf(r)) {
    for (const sys of ['combined', 'encoder']) {
      const d = r.sets[set].vsRules[sys];
      out.push(`| ${SET[set]} | ${sys === 'combined' ? 'encoder + rules' : 'encoder alone'} vs rules | ${FIELDS.map((f) => fmtDiff(d[f]) + (d[f].significant ? ' *' : '')).join(' | ')} |`);
    }
  }
  return out;
}

function langTable(r) {
  const out = ['| Set | Lang | n | rules, all three | encoder + rules, all three | difference |', '| --- | --- | --- | --- | --- | --- |'];
  for (const set of setsOf(r)) {
    for (const [l, v] of Object.entries(r.sets[set].byLang)) {
      out.push(`| ${SET[set]} | ${l} | ${v.n} | ${fmtCI(v.rules.all)} | ${fmtCI(v.combined.all)} | ${fmtDiff(v.combinedVsRules)}${v.combinedVsRules.significant ? ' *' : ''} |`);
    }
  }
  return out;
}

/** Plain-language summary: a difference is called "higher" only when McNemar p < 0.05. */
function headline(r) {
  const t = r.sets.test;
  const u = r.sets.unseen;
  return [
    `On the ${t.n} held-out test messages of our synthetic evaluation set, the on-device model plus rules gets all three`,
    `labels right on ${fmtCI(t.accuracy.combined.all)} of messages, against ${fmtCI(t.accuracy.rules.all)} for keyword rules alone:`,
    `${verdict(t.vsRules.combined.all)}. On ${u.n} further messages written to avoid the generator's templates (the unseen`,
    `set), it is ${fmtCI(u.accuracy.combined.all)} against ${fmtCI(u.accuracy.rules.all)}: ${verdict(u.vsRules.combined.all)}.`,
    ...(r.sets.unseen2
      ? [
          `On a second unseen set of ${r.sets.unseen2.n} messages, written by an independent author after the model was retrained and`,
          `evaluated once, it is ${fmtCI(r.sets.unseen2.accuracy.combined.all)} against ${fmtCI(r.sets.unseen2.accuracy.rules.all)}: ${verdict(r.sets.unseen2.vsRules.combined.all)}.`,
        ]
      : []),
    'Brackets are 95% bootstrap intervals; p is an exact McNemar test on the same messages. All sets are synthetic and',
    'small, so treat these as development numbers, not field accuracy',
    '([`packages/understand/eval`](packages/understand/eval), generated from `eval/results.json`).',
  ];
}

function modelSummary(r) {
  const t = r.sets.test;
  const u = r.sets.unseen;
  const cols = [t, u, ...(r.sets.unseen2 ? [r.sets.unseen2] : [])];
  return [
    `| | test split | unseen set |${r.sets.unseen2 ? ' second unseen set |' : ''}`,
    `| --- | --- | --- |${r.sets.unseen2 ? ' --- |' : ''}`,
    `| messages | ${cols.map((c) => c.n).join(' | ')} |`,
    `| rules alone, all three labels | ${cols.map((c) => fmtCI(c.accuracy.rules.all)).join(' | ')} |`,
    `| encoder + rules (default), all three labels | ${cols.map((c) => fmtCI(c.accuracy.combined.all)).join(' | ')} |`,
    `| paired difference | ${cols.map((c) => fmtDiff(c.vsRules.combined.all)).join(' | ')} |`,
    '',
    'Generated from `packages/understand/eval/results.json`; full tables, per-language rows and calibration in `packages/understand/model/minilm/model-card.md`.',
  ];
}

function cardExport(r) {
  const e = r.export;
  const f = e.fidelity;
  const out = [
    '| | |',
    '| --- | --- |',
    `| Exported parameters | ${(e.exportedParams / 1e6).toFixed(1)}M (source model ${(e.sourceParams / 1e6).toFixed(1)}M; vocabulary pruned to ${e.keptVocab.toLocaleString('en')} pieces, fill strategy \`${e.fill}\`) |`,
    `| \`encoder.int8.onnx\` | ${(e.onnxBytes / 1e6).toFixed(1)} MB |`,
    `| Fidelity (held-out text only) | mean cosine ${f.cosine_mean.toFixed(3)}, min ${f.cosine_min.toFixed(3)} between exported and original fp32 sentence embeddings, n=${f.n} |`,
  ];
  if (f.sets) {
    out.push('', '| Held-out set | n | mean cosine | min | below 0.95 | tokenised exactly as the original |', '| --- | --- | --- | --- | --- | --- |');
    for (const [k, v] of Object.entries(f.sets)) out.push(`| ${k} | ${v.n} | ${v.cosine_mean.toFixed(3)} | ${v.cosine_min.toFixed(3)} | ${v['below_0.95']} | ${v.same_tokenisation} |`);
  }
  return out;
}

function cardEval(r) {
  const cv = r.train.cv ?? {};
  return [
    ...evalTable(r),
    '',
    'Paired differences against rules on the same messages (points, 95% bootstrap interval, messages only that system gets right vs only rules gets right, exact McNemar p; `*` = p < 0.05):',
    '',
    ...pairTable(r),
    '',
    'By message language (all three labels right):',
    '',
    ...langTable(r),
    '',
    `Scam level (\`assessScam\`, code, not changed by this model): test ${fmtCI(r.sets.test.scam.level)}, unseen ${fmtCI(r.sets.unseen.scam.level)}${r.sets.unseen2 ? `, second unseen ${fmtCI(r.sets.unseen2.scam.level)}` : ''}.`,
    `Training: ${r.train.n} train messages; 5-fold CV accuracy of the encoder heads alone: ${['kind', 'action', 'urgency'].map((f) => `${f} ${pct1(cv[f]?.cv_accuracy ?? NaN)}`).join(', ')}.`,
    `Statistics: ${r.stats.ci}, ${r.stats.resamples} resamples, seed ${r.stats.seed}; ${r.stats.test}.`,
  ];
}

function cardCalibration(r) {
  const out = ['| Set | Head | ECE | mean confidence | accuracy |', '| --- | --- | --- | --- | --- |'];
  for (const set of setsOf(r)) for (const f of ['kind', 'action', 'urgency']) {
    const c = r.sets[set].calibration[f];
    out.push(`| ${SET[set]} | ${f} | ${c.ece.toFixed(3)} | ${c.meanConf.toFixed(2)} | ${c.acc.toFixed(2)} |`);
  }
  const g = r.thresholdGrid;
  const ts = g.table.kind.map((x) => x.t);
  out.push(
    '',
    `Threshold grid (train split, out-of-fold, n=${g.n}): accuracy of each field when the encoder's label is used at or above t, through the app's own combination code. Chosen: the middle of the plateau within half a point of the best.`,
    '',
    `| Field | ${ts.map((t) => (t > 1 ? 'never' : t.toFixed(2))).join(' | ')} | chosen |`,
    `| --- | ${ts.map(() => '---').join(' | ')} | --- |`,
    ...['kind', 'action', 'urgency'].map((f) => `| ${f} | ${g.table[f].map((x) => (100 * x.acc).toFixed(1)).join(' | ')} | ${g.best[f].t} |`),
    '',
    `Thresholds shipped in \`heads.json\`: kind ${r.thresholds.kind}, action ${r.thresholds.action}, urgency ${r.thresholds.urgency}.`,
  );
  return out;
}

function evalSummary(r) {
  const t = r.sets.test;
  return [
    `Rules baseline on the test split (${t.n} messages): ${['kind', 'action', 'urgency'].map((f) => `${f} ${fmtCI(t.accuracy.rules[f])}`).join(', ')}, all three right ${fmtCI(t.accuracy.rules.all)}, scam level ${fmtCI(t.scam.level)}.`,
    `On the unseen set (${r.sets.unseen.n} messages): all three right ${fmtCI(r.sets.unseen.accuracy.rules.all)}, scam level ${fmtCI(r.sets.unseen.scam.level)}.`,
    ...(r.sets.unseen2 ? [`On the second unseen set (${r.sets.unseen2.n} messages): all three right ${fmtCI(r.sets.unseen2.accuracy.rules.all)}, scam level ${fmtCI(r.sets.unseen2.scam.level)}.`] : []),
    'Encoder results and paired tests: `results-encoder.md`; machine-readable: `results.json` (both generated by `run-encoder.mjs`).',
  ];
}

export function renderBlocks(r) {
  return {
    headline: headline(r).join('\n'),
    'model-summary': modelSummary(r).join('\n'),
    'card-export': cardExport(r).join('\n'),
    'card-eval': cardEval(r).join('\n'),
    'card-calibration': cardCalibration(r).join('\n'),
    'eval-summary': evalSummary(r).join('\n'),
  };
}

const RE = /<!-- results:([a-z-]+) -->\n([\s\S]*?)<!-- \/results:\1 -->/g;

/** The blocks present in a document: { name: content }. */
export function readBlocks(text) {
  return Object.fromEntries([...text.matchAll(RE)].map((m) => [m[1], m[2].replace(/\n$/, '')]));
}

/** Replace every block's content with the rendered one. Unknown block names throw. */
export function fillBlocks(text, blocks) {
  return text.replace(RE, (_, name) => {
    if (!(name in blocks)) throw new Error(`unknown results block: ${name}`);
    return `<!-- results:${name} -->\n${blocks[name]}\n<!-- /results:${name} -->`;
  });
}

/** Text with every block removed (to check no stray, hand-written evaluation number remains). */
// Also the README block written by scripts/numbers.mjs (scam and photo numbers), checked by `numbers.mjs --check`.
export const outsideBlocks = (text) => text.replace(RE, '').replace(/<!-- numbers:readme[\s\S]*?<!-- \/numbers:readme -->/g, '');
