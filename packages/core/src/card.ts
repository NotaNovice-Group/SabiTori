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

function chooseAmount(input: MessageInput, facts: Facts, lexicons: ReadingLexicon[]): Fact<Money> | undefined {
  if (!facts.amounts.length) return undefined;
  const n = fold(input.text);
  const labels = findTerms(n, [
    ...collect(lexicons, (l) => l.amountWords),
    ...collect(lexicons, (l) => l.scam.moneyReceived),
  ]);
  const balances = findTerms(n, collect(lexicons, (l) => l.balanceWords));
  const score = (a: Fact<Money>) => {
    let s = 0;
    if (labels.some((w) => w.end <= a.span.start && a.span.start - w.end <= NEAR_AMOUNT)) s += 3;
    if (balances.some((w) => w.end <= a.span.start && a.span.start - w.end <= NEAR_BALANCE)) s -= 3;
    return s;
  };
  return [...facts.amounts].sort(
    (a, b) => score(b) - score(a) || b.value.amount - a.value.amount || a.span.start - b.span.start,
  )[0];
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
  const official = new Set(
    (region?.officialSenders ?? [])
      .flatMap((o) => [o.helpline, ...o.shortCodes])
      .filter((x): x is string => !!x)
      .map(last9),
  );
  const trusted = (p: Fact<string>): boolean => {
    if (sender.verified) return true;
    if (official.has(last9(p.value))) return true;
    if (scam.level !== 'no_signs') return false;
    // A message that only claims to be from a company cannot hand out a personal
    // mobile number as that company's help line: impersonators do exactly this.
    if (scam.claimedSenderId && isMobile(p.value, region)) return false;
    const afterPay = payVerbs.some((w) => w.end <= p.span.start && p.span.start - w.end <= NEAR_PAY);
    const afterAmount = facts.amounts.some((a) => a.span.end <= p.span.start && p.span.start - a.span.end <= NEAR_PAY);
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
}): Card {
  const { input, facts, scam, sender } = args;
  const lexicons = args.lexicons ?? [];
  const deadline = chooseDeadline(input, facts, lexicons);
  const understanding = calibrateUrgency(args.understanding, deadline, input.receivedAt);
  const amount = chooseAmount(input, facts, lexicons);
  const preMode = unreadable(input.text) || understanding.confidence < CONFIDENCE_THRESHOLD;
  const contactPhone = chooseContact(input, facts, scam, sender, lexicons, args.region, !preMode);
  const reference = facts.references[0];

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
  if (degradedReason) card.degradedReason = degradedReason;
  // A fact that failed verification is never shown.
  if (ok) {
    if (deadline) card.deadline = deadline;
    if (amount) card.amount = amount;
    if (contactPhone) card.contactPhone = contactPhone;
    if (reference) card.reference = reference;
  }
  return card;
}
