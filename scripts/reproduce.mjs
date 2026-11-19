#!/usr/bin/env node
/**
 * Re-run every published evaluation and check the numbers in the repository came from these runs.
 *
 *   pnpm reproduce          # understanding + scam results (about 1 minute)
 *   pnpm reproduce --ocr    # also the 30-photo OCR benchmark (about 2 minutes more)
 *
 * The understanding results are deterministic: the files are regenerated in place and must come out byte-identical
 * (git shows no change). The OCR benchmark's accuracy columns must match RESULTS.md; its timings depend on the machine.
 * Exit status 1 if anything differs.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmDir = join(root, 'node_modules/.pnpm');
const vn = readdirSync(pnpmDir).find((d) => d.startsWith('vite-node@'));
if (!vn) {
  console.error('Run `pnpm install` first.');
  process.exit(2);
}
const viteNode = join(pnpmDir, vn, 'node_modules/vite-node/vite-node.mjs');
const run = (label, args, opts = {}) => {
  process.stdout.write(`${label} ... `);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', ...opts });
  if (r.status !== 0) {
    console.log('FAILED');
    console.log(r.stdout, r.stderr);
    process.exit(1);
  }
  console.log('done');
  return r.stdout;
};

const FILES = [
  'packages/understand/eval/results-rules.md',
  'packages/understand/eval/results-encoder.md',
  'packages/understand/eval/results.json',
  'packages/understand/model/minilm/model-card.md',
  'README.md',
  'docs/model.md',
  'packages/understand/eval/README.md',
  'docs/numbers.md',
  'site/index.html',
  'apps/app/test/ocr-bench/results/cards.json',
];
const dirty = () => execFileSync('git', ['status', '--porcelain', '--', ...FILES], { cwd: root, encoding: 'utf8' }).trim();
if (dirty()) {
  console.error(`These files have local changes; commit or stash them first:\n${dirty()}`);
  process.exit(2);
}

run('Rules and scam checks, test split', [viteNode, 'packages/understand/eval/run-rules.mjs']);
const unseen = run('Rules and scam checks, unseen set', [viteNode, 'packages/understand/eval/run-rules.mjs', '--split=unseen', '--no-write']);
run('Built-in model (MiniLM) + rules, test and unseen', ['packages/understand/eval/run-encoder.mjs']);
run('Photo cards: amount and date shown from the 30 OCR texts', [viteNode, 'packages/understand/eval/run-photo-cards.mjs']);
run('Model card and README tables', ['packages/understand/eval/model-card.mjs']);
run('Numbers page (docs/numbers.md)', ['scripts/numbers.mjs']);

let ok = true;
const changed = dirty();
if (changed) {
  ok = false;
  console.log(`\nDIFFERENT: the regenerated results do not match the committed ones:\n${changed}\n(see \`git diff\`; \`git checkout -- .\` restores them)`);
} else {
  console.log('\nSAME: every understanding and scam result in the repository was reproduced byte for byte.');
}
const pick = (re) => (unseen.match(re) ?? [])[0];
console.log(`Unseen set, rules alone: ${(pick(/all three right \| [^|]+/) ?? '?').replace('| ', '').trim()}. ${pick(/Any warning on scam\/caution messages:.*$/m) ?? ''}`);

if (process.argv.includes('--ocr')) {
  const results = join(root, 'apps/app/test/ocr-bench/results/rules.json');
  const before = JSON.parse(readFileSync(results, 'utf8'));
  run('OCR benchmark, 30 photos (about 2 minutes)', [join(root, 'apps/app/node_modules/vitest/vitest.mjs'), 'run', 'test/ocr-bench/bench.test.ts'], {
    cwd: join(root, 'apps/app'),
    env: { ...process.env, OCR_BENCH: 'rules', OCR_PAR: '3' },
  });
  const after = JSON.parse(readFileSync(results, 'utf8'));
  execFileSync('git', ['checkout', '--', 'apps/app/test/ocr-bench/results/rules.json'], { cwd: root });
  for (const [i, v] of after.entries()) {
    const b = before[i];
    const same = b && ['cer', 'recall', 'precision', 'f1', 'perfect'].every((k) => b[k] === v[k]);
    if (!same) ok = false;
    const pct = (x) => (x * 100).toFixed(1);
    console.log(`${same ? 'SAME' : 'DIFFERENT'}: ${v.name}: fact recall ${pct(v.recall)}%, precision ${pct(v.precision)}%, every fact right on ${v.perfect}/${v.images.length} pages`);
  }
}
process.exit(ok ? 0 : 1);
