import { describe, expect, it } from 'vitest';
import { amountNearPayIn, extractFacts, guardUnderstanding, type Understanding } from '../src/index.js';
import { fold } from '../src/text.js';
import { ctx, lexicons } from './helpers.js';

// "Nothing to do" next to a date: allowed only for a dated notice (rules found no task, no amount, no alarm word).
const R = '2026-10-31';
const facts = (t: string) => extractFacts(t, { ...ctx, receivedAt: R });
const U = (u: Partial<Understanding>): Understanding => ({ kind: 'school', action: 'nothing', urgency: 'info', confidence: 0.9, producedBy: 'enc', ...u });
const guard = (text: string, rulesAction: Understanding['action'], timeAlarm?: boolean) => {
  const f = facts(text);
  const rules = U({ action: rulesAction, urgency: 'urgent', producedBy: 'rules@1' });
  return guardUnderstanding(U({}), rules, { facts: f, receivedAt: R, amountNearPay: amountNearPayIn(fold(text), f, lexicons), ...(timeAlarm === undefined ? {} : { timeAlarm }) });
};

describe('guard: dated notices may be "nothing"', () => {
  const HOLIDAY = 'Parents are informed that the school will be closed on 07/11/2026 for a public holiday.';
  it('a dated notice where the rules found no task keeps the encoder\'s "nothing"', () => {
    expect(guard(HOLIDAY, 'unclear', false).action).toBe('nothing');
  });
  it('unknown alarm state keeps the old strict rule', () => {
    expect(guard(HOLIDAY, 'unclear').action).toBe('unclear');
  });
  it('an alarm word blocks it', () => {
    expect(guard(HOLIDAY, 'unclear', true).action).toBe('unclear');
  });
  it('any amount blocks it, even without a pay verb', () => {
    expect(guard('Tuition balance of 25,000 FCFA must be cleared before exams start on 30/11/2026.', 'unclear', false).action).toBe('unclear');
  });
  it('a task the rules found blocks it', () => {
    expect(guard('Réunion des parents le 07/11/2026 à 15h.', 'go_to_place', false).action).toBe('go_to_place');
  });
});
