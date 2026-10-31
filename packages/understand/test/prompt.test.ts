import { describe, expect, it } from 'vitest';
import { ACTION_KINDS, MESSAGE_KINDS, URGENCIES } from '@sabitori/core';
import { buildGrammar, buildMessages, FEW_SHOTS, truncateText } from '../src/index.js';
import { input } from './helpers.js';

describe('prompt', () => {
  it('builds system + few-shot pairs + final user turn', () => {
    const m = buildMessages(input('Bonjour facture'));
    expect(m[0]!.role).toBe('system');
    expect(m).toHaveLength(1 + FEW_SHOTS.length * 2 + 1);
    expect(m.at(-1)!.content).toContain('Bonjour facture');
    expect(m.at(-1)!.role).toBe('user');
  });
  it('few-shots use only valid labels and cover fr and en', () => {
    for (const s of FEW_SHOTS) {
      expect(MESSAGE_KINDS).toContain(s.answer.kind);
      expect(ACTION_KINDS).toContain(s.answer.action);
      expect(URGENCIES).toContain(s.answer.urgency);
    }
    expect(FEW_SHOTS.length).toBeGreaterThanOrEqual(4);
    expect(FEW_SHOTS.length).toBeLessThanOrEqual(6);
  });
  it('includes known sender, skips unknown', () => {
    const a = buildMessages({ ...input('x'), sender: { kind: 'name', value: 'ENEO' } }).at(-1)!.content;
    expect(a).toContain('Sender: ENEO');
    const b = buildMessages({ ...input('x'), sender: { kind: 'unknown' } }).at(-1)!.content;
    expect(b).not.toContain('Sender');
  });
  it('truncates long text keeping start and end', () => {
    const t = 'START' + 'a'.repeat(5000) + 'END';
    const r = truncateText(t);
    expect(r.length).toBeLessThanOrEqual(1200);
    expect(r.startsWith('START')).toBe(true);
    expect(r.endsWith('END')).toBe(true);
    expect(truncateText('short')).toBe('short');
  });
  it('grammar lists every label', () => {
    const g = buildGrammar();
    for (const l of [...MESSAGE_KINDS, ...ACTION_KINDS, ...URGENCIES]) expect(g).toContain(`"${l}"`);
  });
});
