// Regenerates messages.jsonl (synthetic part) deterministically: `node build-dataset.mjs`.
// Fixed seed, so the file is byte-identical on every run. Hand-edit the templates in ./gen/*.mjs,
// never messages.jsonl. Real (consented, anonymised) messages go in messages.real.jsonl instead.
import { writeFileSync } from 'node:fs';
import { RECEIVED, makeCtx, mulberry32, ocrNoise } from './gen/lib.mjs';
import fr from './gen/fr.mjs';
import en from './gen/en.mjs';
import wes from './gen/wes.mjs';

const SEED = 20261031;
const rng = mulberry32(SEED);
const STRONG = ['asks_pin', 'sender_mismatch', 'wrong_transfer', 'prize_fee', 'fake_balance', 'pay_to_personal_number'];
const levelOf = (sg, lvl) => lvl ?? (sg.some((s) => STRONG.includes(s)) || sg.length >= 2 ? 'likely_scam' : sg.length === 1 ? 'caution' : 'no_signs');

const specs = [...fr, ...en, ...wes];
const items = [];
for (const spec of specs) {
  for (const t of spec.t) {
    const c = makeCtx(rng, spec);
    const origD = c.D;
    let usedDeadline = false;
    c.D = (o = c.off, st) => {
      if (o === c.off) usedDeadline = true;
      return origD(o, st);
    };
    const origDW = c.DW;
    c.DW = (o = c.off) => {
      if (o === c.off) usedDeadline = true;
      return origDW(o);
    };
    let text = t(c);
    if (c.off !== null && !usedDeadline) throw new Error(`template has due=${spec.due} but never prints its date: ${text}`);
    const from = spec.from ?? 'unk';
    let sender;
    if (from === 'num') sender = { kind: 'number', value: '+237' + c.sn9 };
    else if (from === 'unk') sender = { kind: 'unknown' };
    else sender = { kind: 'name', value: from.replace(/^name:/, '') };
    const src = spec.src ?? 'sms';
    if (sender.kind === 'name' && src === 'sms' && rng() < 0.12) sender = { kind: 'unknown' };
    const urgency = spec.u ?? (c.off === null ? 'info' : c.off <= 7 ? 'urgent' : 'soon');
    const sg = spec.sg ?? [];
    items.push({ spec, text, src, sender, kind: spec.k, action: spec.a, urgency, scam: levelOf(sg, spec.lvl), sg, ocr: src === 'letter' });
  }
}

// OCR noise: every letter (a scan or photo), plus a few SMS screenshots, ~10% overall.
const smsIdx = items.map((x, i) => (x.src === 'sms' && x.spec.lang !== 'wes' ? i : -1)).filter((i) => i >= 0);
for (let k = 0; k < 4; k++) items[smsIdx[Math.floor(rng() * smsIdx.length)]].ocr = true;
for (const x of items) if (x.ocr) x.text = ocrNoise(x.text, rng);

// Deterministic shuffle, then ids.
for (let i = items.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [items[i], items[j]] = [items[j], items[i]];
}
items.forEach((x, i) => (x.id = `sbt-${String(i + 1).padStart(3, '0')}`));

// Stratified split by kind: ~30% of each kind (in shuffled order) is test.
const byKind = new Map();
for (const x of items) (byKind.get(x.kind) ?? byKind.set(x.kind, []).get(x.kind)).push(x);
for (const list of byKind.values()) list.forEach((x, i) => (x.split = i < Math.round(list.length * 0.3) ? 'test' : 'train'));

const lines = items.map((x) =>
  JSON.stringify({
    id: x.id,
    lang: x.spec.lang,
    source: x.src,
    text: x.text,
    receivedAt: RECEIVED,
    sender: x.sender,
    expected: { kind: x.kind, action: x.action, urgency: x.urgency },
    scam: x.scam,
    split: x.split,
    synthetic: true,
  }),
);
writeFileSync(new URL('./messages.jsonl', import.meta.url), lines.join('\n') + '\n');

// Report
const tally = (f) => items.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log('total', items.length);
console.log('lang', tally((x) => x.spec.lang));
console.log('source', tally((x) => x.src));
console.log('kind', tally((x) => x.kind));
console.log('action', tally((x) => x.action));
console.log('urgency', tally((x) => x.urgency));
console.log('scam', tally((x) => x.scam));
console.log('split', tally((x) => x.split));
console.log('ocr', items.filter((x) => x.ocr).length);
const sig = {};
for (const x of items) for (const s of x.sg) sig[s] = (sig[s] ?? 0) + 1;
console.log('signals (declared)', sig);
