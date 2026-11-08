import { readFileSync } from 'node:fs';
import { createRulesClassifier, extractFacts } from '../../core/src/index.ts';
const root = new URL('../../../', import.meta.url).pathname;
const json = (p) => JSON.parse(readFileSync(root + p, 'utf8'));
const region = json('regions/CM/region.json');
const lexicons = [json('packs/fr/reading.json'), json('packs/en/reading.json')];
const c = createRulesClassifier(region, lexicons);
const SOURCE = { sms: 'paste', letter: 'photo', whatsapp: 'share' };
const split = process.argv[2] ?? 'train';
const rows = readFileSync(root + 'packages/understand/eval/messages.jsonl', 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(r => r.split === split && r.lang !== 'wes');
const tally = {};
for (const r of rows) {
  const input = { text: r.text, source: SOURCE[r.source], receivedAt: r.receivedAt, region: 'CM', sender: r.sender };
  const u = await c.classify(input, extractFacts(r.text, { region, lexicons, receivedAt: r.receivedAt }));
  for (const f of ['action', 'urgency', 'kind']) if (u[f] !== r.expected[f]) {
    const k = `${f}: ${r.expected[f]} -> ${u[f]}`; (tally[k] ??= []).push(`[${r.lang}] ${r.text.slice(0, 150)}`);
  }
}
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1].length - a[1].length)) { console.log(`\n## ${k} (${v.length})`); v.slice(0, 4).forEach(x => console.log('  ' + x)); }
