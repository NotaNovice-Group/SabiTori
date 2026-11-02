// One source of truth for published numbers: every evaluation number in the README, the docs and
// the model card is generated from eval/results.json (eval/run-encoder.mjs -> eval/model-card.mjs).
// These tests fail when a document is out of date or a hand-written number slips in.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOCS, outsideBlocks, readBlocks, renderBlocks } from '../eval/blocks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const read = (p: string) => readFileSync(resolve(repo, p), 'utf8');
const json = <T = any>(p: string): T => JSON.parse(read(p)) as T; // eslint-disable-line @typescript-eslint/no-explicit-any
const results = json('packages/understand/eval/results.json');
const blocks = renderBlocks(results);
const jsonl = (p: string) => read(p).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as { split: string });

describe('results.json', () => {
  it('covers exactly the test split and the unseen set', () => {
    expect(results.sets.test.n).toBe(jsonl('packages/understand/eval/messages.jsonl').filter((r) => r.split === 'test').length);
    expect(results.sets.unseen.n).toBe(jsonl('packages/understand/eval/unseen.jsonl').length);
    expect(results.rows.test.length).toBe(results.sets.test.n);
  });

  it('matches the shipped model files (thresholds, export info, file size)', () => {
    const heads = json('packages/understand/model/minilm/heads.json');
    expect(results.thresholds).toEqual(heads.thresholds);
    const info = json('packages/understand/model/minilm/export-info.json');
    expect(results.export.onnxBytes).toBe(info.onnx_bytes);
    expect(results.export.keptVocab).toBe(info.kept_vocab);
    expect(results.export.fidelity).toEqual(info.cosine_vs_original);
    expect(info.cosine_vs_original.heldout_only).toBe(true);
    expect(statSync(resolve(repo, 'packages/understand/model/minilm/encoder.int8.onnx')).size).toBe(info.onnx_bytes);
    expect(results.train.n).toBe(json('packages/understand/model/minilm/train-report.json').n_train);
  });

  it('contains no machine-specific timing', () => {
    expect(JSON.stringify(results)).not.toMatch(/latency|"ms"|median_ms|p95/i);
  });
});

describe.each(Object.entries(DOCS))('%s', (file, need) => {
  const text = read(file);
  const have = readBlocks(text);

  it.each(need)('has the generated block "%s", up to date with results.json', (name) => {
    expect(have[name], `${file} lacks <!-- results:${name} --> (run eval/model-card.mjs)`).toBeDefined();
    expect(have[name], `${file}: block ${name} is stale; run node packages/understand/eval/model-card.mjs`).toBe(blocks[name]);
  });

  it('has no hand-written accuracy number outside the generated blocks', () => {
    const rest = outsideBlocks(text);
    expect(rest, `${file}: a decimal percentage outside a results block`).not.toMatch(/\b\d{1,3}\.\d%/);
    expect(rest, `${file}: a rounded accuracy claim outside a results block`).not.toMatch(/(about|around|roughly) \d{2}% (of )?(held-out|test|unseen|messages right)|labels right on (about )?\d{2}%/i);
  });
});

describe('other published evaluation files agree with results.json', () => {
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

  it('results-rules.md (run-rules.mjs) reports the same rules accuracy on the test split', () => {
    const md = read('packages/understand/eval/results-rules.md');
    const r = results.sets.test.accuracy.rules;
    for (const f of ['kind', 'action', 'urgency'] as const) expect(md).toMatch(new RegExp(`\\| ${f} \\| ${pct(r[f].acc).replace('.', '\\.')} \\[`));
    expect(md).toMatch(new RegExp(`\\| all three right \\| ${pct(r.all.acc).replace('.', '\\.')} \\[`));
    expect(md).toMatch(new RegExp(`\\| scam level \\(assessScam\\) \\| ${pct(results.sets.test.scam.level.acc).replace('.', '\\.')} \\[`));
  });

  it('results-encoder.md is the rendering of results.json, without timing', () => {
    const md = read('packages/understand/eval/results-encoder.md');
    expect(md).toContain('results.json');
    expect(md).not.toMatch(/\d ms\b|latency \(/i);
    const a = results.sets.test.accuracy.combined.all;
    expect(md).toContain(`${pct(a.acc)} [${(100 * a.lo).toFixed(1)}–${(100 * a.hi).toFixed(1)}]`);
  });

  it('the model card states the thresholds in heads.json', () => {
    const card = read('packages/understand/model/minilm/model-card.md');
    const t = json('packages/understand/model/minilm/heads.json').thresholds;
    expect(card).toContain(`kind ${t.kind}, action ${t.action}, urgency ${t.urgency}`);
  });

  it('latency claims are labelled with their conditions and phones are "not yet measured"', () => {
    for (const f of ['README.md', 'docs/model.md', 'packages/understand/model/minilm/model-card.md']) {
      const text = read(f);
      for (const m of text.matchAll(/[^\n]*\b\d+(\.\d+)? ?(ms|s) (per message|median)[^\n]*/g)) {
        expect(m[0], `${f}: timing without its conditions`).toMatch(/4× CPU throttle|4x CPU throttl/);
      }
      if (/per message/.test(text)) expect(text, f).toMatch(/not yet measured on a phone/);
    }
  });

  it('the throttle harness that produces the latency numbers is committed', () => {
    expect(existsSync(resolve(repo, 'packages/understand/harness/encoder-bench.mjs'))).toBe(true);
  });
});

describe('docs/OWNER-TODO.md lists every [OWNER: ...] placeholder with its file and line', () => {
  const todo = read('docs/OWNER-TODO.md');
  const DOC_FILES = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'THIRD_PARTY_NOTICES.md', 'packs/LICENSE.md'];
  const docsDir = (sub: string): string[] =>
    readdirSync(resolve(repo, sub), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? docsDir(`${sub}/${e.name}`) : e.name.endsWith('.md') && e.name !== 'OWNER-TODO.md' ? [`${sub}/${e.name}`] : []);
  const files = [...DOC_FILES, ...docsDir('docs'), 'packages/understand/model/minilm/model-card.md', 'packages/understand/eval/README.md'];
  const found: string[] = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      for (const _ of line.matchAll(/\[OWNER ?: ?[^\]]*\]/g)) found.push(`${f}:${i + 1}`);
    });
  }

  it('every placeholder is in the list, and the list has no stale entry', () => {
    const listed = [...todo.matchAll(/^- \[ \] `([^`]+:\d+)`/gm)].map((m) => m[1]!);
    expect([...new Set(listed)].sort()).toEqual([...new Set(found)].sort());
    expect(todo).toContain(`Total: ${found.length} placeholders`);
  });
});
