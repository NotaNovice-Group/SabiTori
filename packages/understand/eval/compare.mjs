#!/usr/bin/env node
// Paired comparison of two evaluated models (two results.json files from run-encoder.mjs on the same rows).
//
//   node packages/understand/eval/compare.mjs <A.json> <B.json> [--name-a A] [--name-b B] [--out file.md]
//
// For each set (test, unseen), system (encoder alone, encoder + rules) and field: accuracy of A and B,
// the paired difference A - B with a 95% bootstrap interval and the exact McNemar p (stats.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { accuracyCI, paired, fmtCI, fmtDiff } from './stats.mjs';

const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--') && !process.argv[process.argv.indexOf(x) - 1]?.startsWith('--'));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const A = JSON.parse(readFileSync(a, 'utf8'));
const B = JSON.parse(readFileSync(b, 'utf8'));
const nameA = arg('--name-a', 'A');
const nameB = arg('--name-b', 'B');
const FIELDS = ['kind', 'action', 'urgency', 'all'];
const ok = (x, sys, f) => (f === 'all' ? ['kind', 'action', 'urgency'].every((g) => x[sys][g] === x.gold[g]) : x[sys][f] === x.gold[f]) ? 1 : 0;

const out = [`# ${nameA} vs ${nameB}`, ''];
for (const set of Object.keys(A.rows)) {
  const ra = A.rows[set];
  const rb = new Map(B.rows[set].map((x) => [x.id, x]));
  if (ra.length !== rb.size || ra.some((x) => !rb.has(x.id))) throw new Error(`${set}: the two files do not cover the same rows`);
  const rbs = ra.map((x) => rb.get(x.id));
  out.push(`## ${set} (n=${ra.length})`, '', `| System | field | ${nameA} | ${nameB} | ${nameA} - ${nameB} |`, '| --- | --- | --- | --- | --- |');
  for (const sys of ['encoder', 'combined']) {
    for (const f of FIELDS) {
      const oa = ra.map((x) => ok(x, sys, f));
      const ob = rbs.map((x) => ok(x, sys, f));
      const d = paired(oa, ob);
      out.push(`| ${sys === 'combined' ? 'encoder + rules' : 'encoder alone'} | ${f === 'all' ? 'all three' : f} | ${fmtCI(accuracyCI(oa))} | ${fmtCI(accuracyCI(ob))} | ${fmtDiff(d)}${d.significant ? ' *' : ''} |`);
    }
  }
  out.push('');
}
const fa = A.export?.fidelity;
const fb = B.export?.fidelity;
if (fa?.sets && fb?.sets) {
  out.push('## Fidelity: cosine of exported vs original fp32 sentence embeddings (held-out text only)', '', `| Set | n | ${nameA} mean / min | ${nameB} mean / min |`, '| --- | --- | --- | --- |');
  for (const k of Object.keys(fa.sets)) out.push(`| ${k} | ${fa.sets[k].n} | ${fa.sets[k].cosine_mean.toFixed(3)} / ${fa.sets[k].cosine_min.toFixed(3)} | ${fb.sets[k]?.cosine_mean.toFixed(3)} / ${fb.sets[k]?.cosine_min.toFixed(3)} |`);
  out.push(`| all held-out | ${fa.n} | ${fa.cosine_mean.toFixed(3)} / ${fa.cosine_min.toFixed(3)} | ${fb.cosine_mean.toFixed(3)} / ${fb.cosine_min.toFixed(3)} |`, '');
  out.push(`Size: ${nameA} ${(A.export.onnxBytes / 1e6).toFixed(1)} MB (${A.export.keptVocab} pieces), ${nameB} ${(B.export.onnxBytes / 1e6).toFixed(1)} MB (${B.export.keptVocab} pieces).`, '');
}
const md = out.join('\n');
if (arg('--out')) writeFileSync(arg('--out'), md);
console.log(md);
