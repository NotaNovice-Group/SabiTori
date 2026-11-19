// Development aid: rules urgency on TRAIN rows only (messages.jsonl train split, train-extra, train-gen/*).
// Never reads the test split or any unseen set.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRulesClassifier, extractFacts } from '../../core/src/index.ts';
import { decideUrgency, withinDays, extraDays } from '../../core/src/classifier.ts';
import { fold, hasTerm, collect, daysBetween } from '../../core/src/text.ts';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const region = json('regions/CM/region.json');
const lexicons = ['fr', 'en'].map((t) => json(`packs/${t}/reading.json`));
const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
let rows = lines(join(here, 'messages.jsonl')).filter((r) => r.split === 'train').concat(lines(join(here, 'train-extra.jsonl')));
for (const f of readdirSync(join(here, 'train-gen')).filter((f) => f.endsWith('.jsonl') && !f.startsWith('._'))) rows = rows.concat(lines(join(here, 'train-gen', f)));
const SOURCE = { sms: 'paste', letter: 'photo', whatsapp: 'share' };
const clf = createRulesClassifier(region, lexicons);
const decideUrgencyFor = (r, facts, action) => { const n = fold(r.text); return decideUrgency({ action, promo: false, days: facts.dates.length ? facts.dates.map((d) => daysBetween(r.receivedAt, d.value)) : extraDays(n, r.receivedAt), urgentWord: hasTerm(n, collect(lexicons, (l) => l.urgency.urgent)), withinDays: withinDays(n) }); };
const conf = {};
let ok = 0;
const bad = [];
for (const r of rows) {
  const facts = extractFacts(r.text, { region, lexicons, receivedAt: r.receivedAt });
  const u0 = await clf.classify({ text: r.text, source: SOURCE[r.source], receivedAt: r.receivedAt, region: 'CM', sender: r.sender }, facts);
  const u = process.argv.includes('--gold-action') ? { ...u0, urgency: decideUrgencyFor(r, facts, r.expected.action) } : u0;
  const key = `${r.expected.urgency}->${u.urgency}`;
  conf[key] = (conf[key] ?? 0) + 1;
  if (u.urgency === r.expected.urgency) ok++;
  else bad.push({ id: r.id, exp: r.expected.urgency, got: u.urgency, act: r.expected.action, gotAct: u.action, dates: facts.dates.map((d) => d.value).join(','), at: r.receivedAt, text: r.text.replace(/\s+/g, ' ').slice(0, 150) });
}
console.log(`train rows ${rows.length}, rules urgency ${(ok / rows.length * 100).toFixed(1)}%`);
console.log(conf);
const n = Number(process.argv[2] ?? 0);
for (const b of bad.sort(() => 0).slice(0, n)) console.log(JSON.stringify(b));
