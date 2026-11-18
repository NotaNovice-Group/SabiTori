import type {
  Card,
  Fact,
  Facts,
  IsoDate,
  MessageInput,
  Money,
  ScamAssessment,
  Sender,
  Understanding,
} from './types.js';
import type { ReadingLexicon } from './reading.js';
import type { RegionConfig } from './region.js';
import { collect, findTerms, fold } from './text.js';
import { guardUnderstanding } from './guard.js';

/** Below this confidence the card falls back to facts only. */
export const CONFIDENCE_THRESHOLD = 0.55;

const NEAR_DEADLINE = 40;
const NEAR_AMOUNT = 40;
const NEAR_BALANCE = 30;
const MIN_TEXT = 8;

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function unreadable(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_TEXT) return true;
  const visible = t.replace(/\s/g, '');
  const good = (visible.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const bad = (visible.match(/�/g) ?? []).length;
  return good / visible.length < 0.5 || bad / visible.length > 0.1;
}

function chooseDeadline(input: MessageInput, facts: Facts, lexicons: ReadingLexicon[]): Fact<IsoDate> | undefined {
  const n = fold(input.text);
  const words = findTerms(n, collect(lexicons, (l) => l.deadlineWords));
  const near = (d: Fact<IsoDate>) => words.some((w) => w.end <= d.span.start && d.span.start - w.end <= NEAR_DEADLINE);
  // Explicit dates ("15/11/2026", "9 novembre") beat words ("demain", "vendredi"); then the earliest.
  const isExplicit = (d: Fact<IsoDate>) => /\d/.test(d.raw);
  const byDate = (a: Fact<IsoDate>, b: Fact<IsoDate>) =>
    Number(isExplicit(b)) - Number(isExplicit(a)) || a.value.localeCompare(b.value) || a.span.start - b.span.start;
  const future = facts.dates.filter((d) => d.value >= input.receivedAt).sort(byDate);
  const nearDates = facts.dates.filter(near);
  const nearFuture = nearDates.filter((d) => d.value >= input.receivedAt).sort(byDate);
  if (nearFuture[0]) return nearFuture[0];
  if (nearDates.length) {
    const pool = nearDates.some(isExplicit) ? nearDates.filter(isExplicit) : nearDates;
    return [...pool].sort((a, b) => a.value.localeCompare(b.value) || a.span.start - b.span.start)[pool.length - 1];
  }
  return future[0];
}

function chooseAmount(
  input: MessageInput,
  facts: Facts,
  lexicons: ReadingLexicon[],
  deadline?: Fact<IsoDate>,
): Fact<Money> | undefined {
  if (!facts.amounts.length) return undefined;
  const n = fold(input.text);
  const labels = findTerms(n, [
    ...collect(lexicons, (l) => l.amountWords),
    ...collect(lexicons, (l) => l.scam.moneyReceived),
  ]);
  const balances = findTerms(n, collect(lexicons, (l) => l.balanceWords));
  // A balance is what is left, never what is asked: an amount whose nearest label before it is a balance word is dropped.
  const isBalance = (a: Fact<Money>) => {
    const b = balances.filter((w) => w.end <= a.span.start && a.span.start - w.end <= NEAR_BALANCE);
    if (!b.length) return false;
    const nearestBalance = Math.max(...b.map((w) => w.end));
    return !labels.some((w) => w.end > nearestBalance && w.end <= a.span.start);
  };
  const pool = facts.amounts.filter((a) => !isBalance(a));
  if (!pool.length) return undefined;
  const score = (a: Fact<Money>) => (labels.some((w) => w.end <= a.span.start && a.span.start - w.end <= NEAR_AMOUNT) ? 3 : 0);

  // Several instalments ("45 000 FCFA avant le 15/10, 30 000 FCFA avant le 15/01"): the amount that goes with the
  // chosen deadline is the one in its own clause, the closest one just before it (else just after).
  if (deadline && pool.length > 1) {
    const clause = clauseAround(n, deadline.span.start, deadline.span.end);
    const inClause = pool.filter((a) => a.span.start >= clause.start && a.span.end <= clause.end);
    if (inClause.length) {
      const dist = (a: Fact<Money>) =>
        a.span.end <= deadline.span.start ? deadline.span.start - a.span.end : 1000 + a.span.start - deadline.span.end;
      return [...inClause].sort((a, b) => dist(a) - dist(b))[0];
    }
  }
  return [...pool].sort(
    (a, b) => score(b) - score(a) || b.value.amount - a.value.amount || a.span.start - b.span.start,
  )[0];
}

/** The clause holding [start, end): bounded by sentence ends, semicolons and commas that are not inside a number. */
function clauseAround(n: string, start: number, end: number): { start: number; end: number } {
  const stop = /[.!?\n\r]+(?=\s|$)|;|(?<!\d),|,(?!\d)/g;
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = stop.exec(n))) {
    if (m.index + m[0].length <= start) from = m.index + m[0].length;
    else if (m.index >= end) return { start: from, end: m.index };
  }
  return { start: from, end: n.length };
}

const NEAR_PAY = 40;

/**
 * The number spoken as "call for help". Only when it is trustworthy:
 *  (a) the sender is verified, or
 *  (b) it is an official sender's own helpline / short number, or
 *  (c) the card is full, shows no scam sign, and the number is not where the message asks to pay
 *      (not within NEAR_PAY characters after a pay/send verb or an amount).
 * Never in facts_only mode or for a likely scam.
 */
function chooseContact(
  input: MessageInput,
  facts: Facts,
  scam: ScamAssessment,
  sender: Sender,
  lexicons: ReadingLexicon[],
  region: RegionConfig | undefined,
  full: boolean,
): Fact<string> | undefined {
  if (!full) return undefined;
  if (scam.level === 'likely_scam') return undefined;
  if (!facts.phones.length) return undefined;
  const n = fold(input.text);
  const words = findTerms(n, collect(lexicons, (l) => l.contactWords));
  // A number that merely names who sent money is not a number to call.
  const received = findTerms(n, collect(lexicons, (l) => l.scam.moneyReceived));
  const payVerbs = findTerms(n, collect(lexicons, (l) => l.scam.payVerbs));
  const last9 = (v: string) => v.replace(/\D/g, '').slice(-9);
  const ownNumbers = (o: { helpline?: string; shortCodes: string[] }) =>
    [o.helpline, ...o.shortCodes].filter((x): x is string => !!x).map(last9);
  const official = new Set((region?.officialSenders ?? []).flatMap(ownNumbers));
  const trusted = (p: Fact<string>): boolean => {
    // Verification only whitelists the official numbers (a company's own helpline / short codes).
    if (official.has(last9(p.value))) return true;
    const mobile = isMobile(p.value, region);
    const afterPay = payVerbs.some((w) => w.end <= p.span.start && p.span.start - w.end <= NEAR_PAY);
    const afterAmount = facts.amounts.some((a) => a.span.end <= p.span.start && p.span.start - a.span.end <= NEAR_PAY);
    if (sender.verified) {
      // A verified name does not make a personal mobile number written where the message asks to pay a help line.
      return !(mobile && (afterPay || afterAmount));
    }
    if (scam.level !== 'no_signs') return false;
    // A message that only claims to be from a company cannot hand out a personal
    // mobile number as that company's help line: impersonators do exactly this.
    if (scam.claimedSenderId && mobile) return false;
    return !afterPay && !afterAmount;
  };
  const pool = facts.phones.filter(
    (p) => trusted(p) && !received.some((w) => w.end <= p.span.start && p.span.start - w.end <= 30),
  );
  const nearCall = pool.find((p) => words.some((w) => w.end <= p.span.start && p.span.start - w.end <= 40));
  return nearCall ?? pool[0];
}

/** True for an ordinary mobile subscriber number (region-defined), not a landline or short code. */
function isMobile(e164: string, region: RegionConfig | undefined): boolean {
  if (!region) return false;
  const national = e164.replace(/\D/g, '').replace(new RegExp(`^${region.phone.countryCode}`), '');
  const mobile = region.phone.mobilePrefixes ?? [];
  return mobile.some((prefix) => national.startsWith(prefix));
}

/** Days from `from` to `to`, both YYYY-MM-DD. */
function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * "Urgent" is reserved for deadlines that are close or already passed. A bill due
 * in two weeks that mentions a cut-off is "soon": crying wolf teaches people to
 * ignore the red.
 */
export const URGENT_WITHIN_DAYS = 7;
/**
 * A time written right after the deadline date: "à 9h00", "a 14h30", "at 9:30", ", 08h". 24-hour clock, h or colon;
 * only a few characters after the date, so a time elsewhere in the message is never taken for it.
 */
const TIME_AFTER = /^[\s,]*(?:(?:à|a|at|vers|dès|des|from)\s+)?([01]?\d|2[0-3])\s?(?:h|H|:)\s?([0-5]\d)?(?![\d:])/u;
/** 12-hour clock with am/pm: "3pm", "3 pm", "10:30 am", "8 a.m.". */
const TIME_AFTER_12 = /^[\s,]*(?:(?:at|from)\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s?([ap])\.?m\b\.?/iu;
export function timeAfter(text: string, from: number): Fact<string> | undefined {
  const window = text.slice(from, from + 24);
  const m12 = TIME_AFTER_12.exec(window);
  const m = m12 ?? TIME_AFTER.exec(window);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (m12) hour = (hour % 12) + (m12[3]!.toLowerCase() === 'p' ? 12 : 0);
  const start = from + m.index + m[0].search(/\d/);
  const end = from + m.index + m[0].length;
  return { value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, span: { start, end }, raw: text.slice(start, end) };
}

/** A start word right before the date, a weekday allowed in between: "from Monday 23rd", "à partir du 23/11", "dès le 5". */
const STARTS = /(?:\bfrom|\bstarting(?: on| from)?|\bbeginning|à partir d[ue']|a partir d[ue']|dès l[ea']|\bdes le)\s*(?:\p{L}+\s+)?$/iu;
export function startsOn(text: string, dateStart: number): boolean {
  return STARTS.test(text.slice(Math.max(0, dateStart - 30), dateStart));
}

function calibrateUrgency(u: Understanding, deadline: Fact<IsoDate> | undefined, receivedAt: IsoDate): Understanding {
  if (u.urgency !== 'urgent' || !deadline) return u;
  return daysBetween(receivedAt, deadline.value) > URGENT_WITHIN_DAYS ? { ...u, urgency: 'soon' } : u;
}

function verified<T>(text: string, f: Fact<T> | undefined, pool: Fact<T>[]): boolean {
  if (!f) return true;
  if (f.span.start < 0 || f.span.end > text.length || f.span.start >= f.span.end) return false;
  if (text.slice(f.span.start, f.span.end) !== f.raw) return false;
  return pool.some(
    (p) =>
      p.span.start === f.span.start &&
      p.span.end === f.span.end &&
      p.raw === f.raw &&
      JSON.stringify(p.value) === JSON.stringify(f.value),
  );
}

export function buildCard(args: {
  input: MessageInput;
  facts: Facts;
  understanding: Understanding;
  scam: ScamAssessment;
  sender: Sender;
  lexicons?: ReadingLexicon[];
  region?: RegionConfig;
  /** The rules' own reading, when another classifier answered: the guard keeps what it must not weaken. */
  rules?: Understanding;
}): Card {
  const { input, facts, scam, sender } = args;
  const lexicons = args.lexicons ?? [];
  const deadline = chooseDeadline(input, facts, lexicons);
  let understanding = args.understanding;
  if (args.rules) {
    const n = fold(input.text);
    const pay = findTerms(n, collect(lexicons, (l) => l.scam.payVerbs));
    const amountNearPay = facts.amounts.some((a) =>
      pay.some((w) => (w.end <= a.span.start ? a.span.start - w.end : w.start - a.span.end) <= NEAR_PAY),
    );
    understanding = guardUnderstanding(understanding, args.rules, {
      facts,
      receivedAt: input.receivedAt,
      amountNearPay,
      scamLevel: scam.level,
    });
  }
  understanding = calibrateUrgency(understanding, deadline, input.receivedAt);
  const amount = chooseAmount(input, facts, lexicons, deadline);
  const preMode = unreadable(input.text) || understanding.confidence < CONFIDENCE_THRESHOLD;
  const contactPhone = chooseContact(input, facts, scam, sender, lexicons, args.region, !preMode);
  const reference = facts.references[0];
  const deadlineTime = deadline ? timeAfter(input.text, deadline.span.end) : undefined;
  const deadlineFrom = deadline ? startsOn(input.text, deadline.span.start) : false;

  const ok =
    verified(input.text, deadline, facts.dates) &&
    verified(input.text, amount, facts.amounts) &&
    verified(input.text, contactPhone, facts.phones) &&
    verified(input.text, reference, facts.references);

  let mode: Card['mode'] = 'full';
  let degradedReason: Card['degradedReason'];
  if (unreadable(input.text)) {
    mode = 'facts_only';
    degradedReason = 'unreadable';
  } else if (understanding.confidence < CONFIDENCE_THRESHOLD) {
    mode = 'facts_only';
    degradedReason = 'low_confidence';
  } else if (!ok) {
    mode = 'facts_only';
    degradedReason = 'verification_failed';
  }

  const card: Card = {
    id: `card-${hash(input.receivedAt + '|' + input.text)}`,
    createdAt: new Date().toISOString(),
    input,
    facts,
    sender,
    understanding,
    scam,
    mode,
  };
  if (args.rules && args.rules.kind !== understanding.kind) card.rulesKind = args.rules.kind;
  if (degradedReason) card.degradedReason = degradedReason;
  // A fact that failed verification is never shown.
  if (ok) {
    if (deadline) card.deadline = deadline;
    if (deadline && deadlineTime) card.deadlineTime = deadlineTime;
    if (deadline && deadlineFrom) card.deadlineFrom = true;
    if (amount) card.amount = amount;
    if (contactPhone) card.contactPhone = contactPhone;
    if (reference) card.reference = reference;
  }
  return card;
}
