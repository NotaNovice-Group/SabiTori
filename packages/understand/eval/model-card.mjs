#!/usr/bin/env node
// Regenerates the evaluation blocks in README.md, docs/model.md, model/minilm/model-card.md and
// eval/README.md from eval/results.json (written by run-encoder.mjs):
//
//   node packages/understand/eval/model-card.mjs
//
// test/model-card.test.ts fails when a file is out of date with results.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS, fillBlocks, readBlocks, renderBlocks } from './blocks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const blocks = renderBlocks(JSON.parse(readFileSync(resolve(here, 'results.json'), 'utf8')));
for (const [file, need] of Object.entries(DOCS)) {
  const p = resolve(repo, file);
  const text = readFileSync(p, 'utf8');
  const have = Object.keys(readBlocks(text));
  for (const n of need) if (!have.includes(n)) throw new Error(`${file}: missing <!-- results:${n} --> block`);
  const next = fillBlocks(text, blocks);
  if (next !== text) writeFileSync(p, next);
  console.log(`${next === text ? 'unchanged' : 'updated  '} ${file}`);
}
