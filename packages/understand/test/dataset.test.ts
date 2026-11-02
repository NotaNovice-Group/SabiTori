import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTION_KINDS, MESSAGE_KINDS, URGENCIES } from '@sabitori/core';

const LANGS = ['fr', 'en', 'wes'];
const SOURCES = ['sms', 'letter', 'whatsapp'];
const SCAM_LEVELS = ['likely_scam', 'caution', 'no_signs'];
const SPLITS = ['train', 'test'];
const SENDER_KINDS = ['name', 'number', 'unknown'];
const KEYS = ['id', 'lang', 'source', 'text', 'receivedAt', 'sender', 'expected', 'scam', 'split', 'synthetic'];

interface Row {
  id: string;
  lang: string;
  source: string;
  text: string;
  receivedAt: string;
  sender: { kind: string; value?: string };
  expected: { kind: string; action: string; urgency: string };
  scam: string;
  split: string;
  synthetic: boolean;
}

function load(file: string): Row[] {
  const raw = readFileSync(new URL(`../eval/${file}`, import.meta.url), 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l, i) => {
      try {
        return JSON.parse(l) as Row;
      } catch {
        throw new Error(`${file} line ${i + 1} is not valid JSON`);
      }
    });
}

const rows = load('messages.jsonl');
const realUrl = new URL('../eval/messages.real.jsonl', import.meta.url);
const real = existsSync(realUrl) ? load('messages.real.jsonl') : [];
const all = [...rows, ...real];

const count = <T>(xs: T[], f: (x: T) => string) => {
  const m: Record<string, number> = {};
  for (const x of xs) m[f(x)] = (m[f(x)] ?? 0) + 1;
  return m;
};

describe('eval dataset: every line', () => {
  it('is not empty and ends with a newline', () => {
    expect(rows.length).toBeGreaterThanOrEqual(300);
    expect(readFileSync(new URL('../eval/messages.jsonl', import.meta.url), 'utf8').endsWith('\n')).toBe(true);
  });

  it.each(all.map((r) => [r.id, r] as const))('%s has a valid shape and closed labels', (_id, r) => {
    expect(Object.keys(r).sort()).toEqual([...KEYS].sort());
    expect(r.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(LANGS).toContain(r.lang);
    expect(SOURCES).toContain(r.source);
    expect(typeof r.text).toBe('string');
    expect(r.text.trim().length).toBeGreaterThan(10);
    expect(r.receivedAt).toBe('2026-10-31');
    expect(SENDER_KINDS).toContain(r.sender.kind);
    if (r.sender.kind === 'unknown') expect(r.sender.value).toBeUndefined();
    else expect(typeof r.sender.value === 'string' && r.sender.value.length > 0).toBe(true);
    expect(Object.keys(r.expected).sort()).toEqual(['action', 'kind', 'urgency']);
    expect(MESSAGE_KINDS as readonly string[]).toContain(r.expected.kind);
    expect(ACTION_KINDS as readonly string[]).toContain(r.expected.action);
    expect(URGENCIES as readonly string[]).toContain(r.expected.urgency);
    expect(SCAM_LEVELS).toContain(r.scam);
    expect(SPLITS).toContain(r.split);
    expect(typeof r.synthetic).toBe('boolean');
  });

  it('uses only fictional phone numbers (677 00 xx xx, 699 00 xx xx, 233 00 xx xx)', () => {
    for (const r of all.filter((x) => x.synthetic)) {
      if (r.sender.kind === 'number' && /^\+237/.test(r.sender.value ?? '')) {
        expect(r.sender.value, r.id).toMatch(/^\+237(677|699)00\d{4}$/);
      }
      // Phone-shaped groups written with spaces: 6xx xx xx xx or 6 xx xx xx xx or 2xx xx xx xx.
      for (const m of r.text.matchAll(/(?<![\d])(?:\+?237\s?)?([62]\s?\d{2}\s\d{2}\s\d{2}\s\d{2})(?![\d])/g)) {
        const digits = m[1]!.replace(/\s/g, '');
        expect(digits, `${r.id}: ${m[0]}`).toMatch(/^(677|699|233)00\d{4}$/);
      }
    }
  });
});

describe('eval dataset: set-level properties', () => {
  it('has unique ids', () => {
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
  });

  it('has no duplicate texts within the same language', () => {
    expect(new Set(rows.map((r) => `${r.lang}|${r.text}`)).size).toBe(rows.length);
  });

  it('synthetic rows are marked synthetic in messages.jsonl; real rows are not', () => {
    expect(rows.every((r) => r.synthetic === true)).toBe(true);
    expect(real.every((r) => r.synthetic === false)).toBe(true);
  });

  it('covers every message kind and every action at least 10 times', () => {
    const kinds = count(rows, (r) => r.expected.kind);
    const actions = count(rows, (r) => r.expected.action);
    for (const k of MESSAGE_KINDS) expect(kinds[k] ?? 0, `kind ${k}`).toBeGreaterThanOrEqual(10);
    for (const a of ACTION_KINDS) expect(actions[a] ?? 0, `action ${a}`).toBeGreaterThanOrEqual(10);
    const urg = count(rows, (r) => r.expected.urgency);
    for (const u of URGENCIES) expect(urg[u] ?? 0, `urgency ${u}`).toBeGreaterThanOrEqual(10);
    const scam = count(rows, (r) => r.scam);
    for (const s of SCAM_LEVELS) expect(scam[s] ?? 0, `scam ${s}`).toBeGreaterThanOrEqual(10);
  });

  it('keeps the language, source and scam mix', () => {
    const n = rows.length;
    const lang = count(rows, (r) => r.lang);
    expect(lang.fr! / n).toBeGreaterThan(0.4);
    expect(lang.fr! / n).toBeLessThan(0.5);
    expect(lang.en! / n).toBeGreaterThan(0.35);
    expect(lang.en! / n).toBeLessThan(0.45);
    expect(lang.wes! / n).toBeGreaterThan(0.12);
    expect(lang.wes! / n).toBeLessThan(0.18);
    const src = count(rows, (r) => r.source);
    for (const s of SOURCES) expect(src[s] ?? 0, `source ${s}`).toBeGreaterThan(0);
    const scammy = rows.filter((r) => r.scam !== 'no_signs').length / n;
    expect(scammy).toBeGreaterThan(0.2);
    expect(scammy).toBeLessThan(0.35);
  });

  it('contains OCR-noisy variants (digit/letter swaps or broken lines)', () => {
    const noisy = rows.filter((r) => /\d[OlS]\d|\b[0-9]*[Ol][0-9]+\b|[a-zà-ÿ]\n[a-zà-ÿ]/.test(r.text) || r.text.split('\n').length > 3);
    expect(noisy.length / rows.length).toBeGreaterThan(0.07);
  });

  it('has a stratified ~70/30 split with every kind in both parts', () => {
    const test = rows.filter((r) => r.split === 'test');
    expect(test.length / rows.length).toBeGreaterThan(0.27);
    expect(test.length / rows.length).toBeLessThan(0.33);
    for (const k of MESSAGE_KINDS) {
      const of = rows.filter((r) => r.expected.kind === k);
      const t = of.filter((r) => r.split === 'test').length;
      expect(t, `test share of ${k}`).toBeGreaterThanOrEqual(Math.floor(of.length * 0.25));
      expect(t, `test share of ${k}`).toBeLessThanOrEqual(Math.ceil(of.length * 0.35));
      expect(of.length - t, `train count of ${k}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('applies the urgency rule to sms/letter dates it can read (no info for a dated pay/go action ending today)', () => {
    // Spot check of the labelling rule: a message that says "avant le 01/11/2026" (1 day away) is urgent.
    const hits = rows.filter((r) => /\b0?[1-7]\/11\/2026\b|\b0?[1-7]-11-2026\b/.test(r.text) && /avant|before|jusqu|au plus tard|due|date limite|deadline/i.test(r.text));
    for (const r of hits) expect(r.expected.urgency, r.id).toBe('urgent');
  });
});

describe('eval README', () => {
  const readme = readFileSync(new URL('../eval/README.md', import.meta.url), 'utf8');
  it('states the licence, synthetic origin and Pidgin review requirement', () => {
    expect(readme).toContain('CC-BY-SA-4.0');
    expect(readme.toLowerCase()).toContain('synthetic');
    expect(readme.toLowerCase()).toContain('native speaker');
  });
});
