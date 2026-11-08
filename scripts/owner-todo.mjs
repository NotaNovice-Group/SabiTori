#!/usr/bin/env node
/**
 * Regenerates the placeholder sections of docs/OWNER-TODO.md from the documents themselves, so the list never goes
 * stale when a document changes length. Keeps the intro and the "Checks without a placeholder" section as they are,
 * and keeps a ticked box ticked when the same placeholder is still there.
 *
 *   node scripts/owner-todo.mjs          # rewrite docs/OWNER-TODO.md
 *   node scripts/owner-todo.mjs --check  # exit 1 if it is out of date (no write)
 *
 * Scans the same files as packages/understand/test/model-card.test.ts.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(repo, f), 'utf8');
const DOC_FILES = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'THIRD_PARTY_NOTICES.md', 'packs/LICENSE.md'];
const docsDir = (sub) =>
  readdirSync(join(repo, sub), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? docsDir(`${sub}/${e.name}`) : e.name.endsWith('.md') && e.name !== 'OWNER-TODO.md' ? [`${sub}/${e.name}`] : [],
  );
const files = [...DOC_FILES, ...docsDir('docs'), 'packages/understand/model/minilm/model-card.md', 'packages/understand/eval/README.md'];

const TODO = 'docs/OWNER-TODO.md';
const old = read(TODO);
const ticked = new Set([...old.matchAll(/^- \[x\] `[^`]+:\d+` (.*)$/gim)].map((m) => m[1]));

const byFile = new Map();
let total = 0;
for (const f of files) {
  read(f).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\[OWNER ?: ?([^\]]*)\]/g)) {
      const text = m[1].trim();
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f).push(`- [${ticked.has(text) ? 'x' : ' '}] \`${f}:${i + 1}\` ${text}`);
      total++;
    }
  });
}

const intro = old.slice(0, old.indexOf('Total: '));
const checksAt = old.indexOf('## Checks without a placeholder');
const checks = checksAt >= 0 ? old.slice(checksAt) : '';
const sections = [...byFile.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([f, items]) => `## \`${f}\` (${items.length})\n\n${items.join('\n')}\n`);
const next = `${intro}Total: ${total} placeholders in ${byFile.size} files.\n\n${sections.join('\n')}\n${checks}`;

if (process.argv.includes('--check')) {
  if (next !== old) {
    console.error(`${TODO} is out of date: run node scripts/owner-todo.mjs`);
    process.exit(1);
  }
  console.log(`${TODO} is up to date (${total} placeholders).`);
} else {
  writeFileSync(join(repo, TODO), next);
  console.log(`${TODO}: ${total} placeholders in ${byFile.size} files.`);
}
