/**
 * A learned classifier may only choose labels the facts do not contradict. This guard keeps the rules' answer
 * where a label would weaken a safety-relevant reading of the message: a "nothing to do" next to a deadline or an
 * amount, a lower urgency than the dates say, a "pay" the rules did not find in a message already under caution.
 * Pure: facts and the rules' understanding in, understanding out.
 */
import type { ActionKind, Facts, IsoDate, Understanding, Urgency } from './types.js';
import { daysBetween, isValidYmd, parseIso } from './text.js';

const RANK: Record<Urgency, number> = { info: 0, soon: 1, urgent: 2 };
const higher = (a: Urgency, b: Urgency): Urgency => (RANK[a] >= RANK[b] ? a : b);
/** Same bound as the card's "urgent" calibration. */
const WITHIN_DAYS = 7;
const URGENT_DAYS = 2;
const TASKS: ActionKind[] = ['pay', 'bring_document', 'go_to_place'];

/** Days from the received date to the nearest date in the text that is not in the past. */
export function nearestFutureDays(facts: Facts, receivedAt: IsoDate): number | undefined {
  const p = parseIso(receivedAt);
  if (!p || !isValidYmd(p.y, p.m, p.d)) return undefined;
  const days = facts.dates.map((d) => daysBetween(receivedAt, d.value)).filter((x) => x >= 0);
  return days.length ? Math.min(...days) : undefined;
}

export interface GuardContext {
  facts: Facts;
  receivedAt: IsoDate;
  /** An amount sits next to a pay/send verb (precise when the caller has the lexicons; else "any amount"). */
  amountNearPay: boolean;
  scamLevel?: 'no_signs' | 'caution' | 'likely_scam';
}

export function guardUnderstanding(u: Understanding, rules: Understanding, ctx: GuardContext): Understanding {
  if (u === rules) return u;
  const days = nearestFutureDays(ctx.facts, ctx.receivedAt);
  let { action, urgency } = u;

  // (a) "Nothing to do" cannot stand next to a future deadline or an amount to pay.
  if (action === 'nothing' && rules.action !== 'nothing' && (days !== undefined || ctx.amountNearPay)) action = rules.action;
  // (c) Under caution the model may not turn a message into "you must pay" when the rules found no payment.
  if (ctx.scamLevel === 'caution' && action === 'pay' && (rules.action === 'unclear' || rules.action === 'nothing'))
    action = rules.action;

  // (b) Urgency is never below what the dates say.
  if (days !== undefined && action !== 'nothing') {
    urgency = higher(urgency, days <= URGENT_DAYS ? 'urgent' : 'soon');
    if (days <= WITHIN_DAYS) urgency = higher(urgency, rules.urgency);
  }
  if (days !== undefined && days <= WITHIN_DAYS && TASKS.includes(action)) urgency = higher(urgency, 'soon');

  return action === u.action && urgency === u.urgency ? u : { ...u, action, urgency };
}
