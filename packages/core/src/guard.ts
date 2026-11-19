/**
 * A learned classifier may only choose labels the facts do not contradict. This guard keeps the rules' answer
 * where a label would weaken a safety-relevant reading of the message: a "nothing to do" next to a deadline or an
 * amount, a lower urgency than the dates say, a "pay" the rules did not find in a message already under caution.
 * Pure: facts and the rules' understanding in, understanding out.
 */
import type { ActionKind, Facts, IsoDate, Understanding, Urgency } from './types.js';
import type { ReadingLexicon } from './reading.js';
import { collect, daysBetween, findTerms, isValidYmd, parseIso } from './text.js';

const RANK: Record<Urgency, number> = { info: 0, soon: 1, urgent: 2 };
const higher = (a: Urgency, b: Urgency): Urgency => (RANK[a] >= RANK[b] ? a : b);
/** Same bound as the card's "urgent" calibration. */
const WITHIN_DAYS = 7;
const URGENT_DAYS = 2;
const TASKS: ActionKind[] = ['pay', 'bring_document', 'go_to_place'];

/** Characters between a pay/send verb and an amount for the amount to count as "to pay". */
export const NEAR_PAY = 40;

/** An amount in the text sits within NEAR_PAY characters of a pay/send verb (`n`: the folded text). */
export function amountNearPayIn(n: string, facts: Facts, lexicons: ReadingLexicon[]): boolean {
  const pay = findTerms(n, collect(lexicons, (l) => l.scam.payVerbs));
  return facts.amounts.some((a) => pay.some((w) => (w.end <= a.span.start ? a.span.start - w.end : w.start - a.span.end) <= NEAR_PAY));
}

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
  /** An alarm word ("today", "tonight") or "within N days/hours" is in the text. Unknown (undefined) = assume yes. */
  timeAlarm?: boolean;
}

export function guardUnderstanding(u: Understanding, rules: Understanding, ctx: GuardContext): Understanding {
  if (u === rules) return u;
  const days = nearestFutureDays(ctx.facts, ctx.receivedAt);
  let { action, urgency } = u;

  // (a) "Nothing to do" cannot stand next to a future deadline or an amount to pay.
  // A date alone does not block "nothing" when the rules themselves found no task (their answer is "unclear") and the
  // text has no amount and no alarm word: a dated notice (planned cut, holiday) needs nothing from the reader.
  const datedNotice = rules.action === 'unclear' && ctx.timeAlarm === false && ctx.facts.amounts.length === 0;
  if (action === 'nothing' && rules.action !== 'nothing' && ((days !== undefined && !datedNotice) || ctx.amountNearPay)) action = rules.action;
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
