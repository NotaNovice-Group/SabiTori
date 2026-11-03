import type { Facts, MessageInput, ScamAssessment, ScamSignal } from './types.js';
import { SCAM_SIGNALS } from './types.js';
import type { RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import { collect, findTerms, fold, hasTerm, splitSentences, termSource } from './text.js';
import { matchSender } from './sender.js';

const STRONG: ScamSignal[] = [
  'asks_pin',
  'sender_mismatch',
  'wrong_transfer',
  'prize_fee',
  'fake_balance',
  'pay_to_personal_number',
];
const digitsOf = (s: string) => s.replace(/\D/g, '');

function isOrdinaryNumber(input: MessageInput): boolean {
  return input.sender?.kind === 'number' && digitsOf(input.sender.value ?? '').length >= 8;
}

/**
 * Scam signals from code. `lexicons` supplies every phrase; without them only
 * the structural signals (link, sender_mismatch) can fire.
 * Never returns anything meaning "safe".
 */
export function assessScam(
  input: MessageInput,
  facts: Facts,
  region: RegionConfig,
  lexicons: ReadingLexicon[] = [],
): ScamAssessment {
  const n = fold(input.text);
  const S = (pick: (s: ReadingLexicon['scam']) => string[] | undefined) => collect(lexicons, (l) => pick(l.scam));
  const found = new Set<ScamSignal>();
  const { sender, claimedSenderId } = matchSender(input, region, lexicons);

  // asks_pin: a clause with a secret word AND an asking verb, not a warning. A negation only covers
  // its own clause (comma, semicolon, "mais"/"but"...). A clause that asks for a secret AND holds a
  // phone number is always a hit: a warning never tells you where to send the secret.
  const secret = S((s) => s.secretWords);
  const verbs = S((s) => s.askVerbs);
  const neg = S((s) => s.negations);
  const breaks = S((s) => s.clauseBreaks);
  const breakRe = new RegExp(
    `(?<!\\d),|,(?!\\d)|;${breaks.length ? '|' + breaks.map((b) => termSource(b)).join('|') : ''}`,
    'gu',
  );
  for (const sen of splitSentences(n)) {
    let from = sen.start;
    const ranges: { start: number; end: number }[] = [];
    const part = n.slice(sen.start, sen.end);
    breakRe.lastIndex = 0;
    let bm: RegExpExecArray | null;
    while ((bm = breakRe.exec(part))) {
      if (bm[0].length === 0) {
        breakRe.lastIndex++;
        continue;
      }
      ranges.push({ start: from, end: sen.start + bm.index });
      from = sen.start + bm.index + bm[0].length;
    }
    ranges.push({ start: from, end: sen.end });
    // A clause naming a secret is a hit if it (or the clause before) holds an ask verb and it is not a warning.
    // A clause that has the ask verb, the secret AND a phone number is a hit even if it says "never".
    ranges.forEach((r, i) => {
      const clause = n.slice(r.start, r.end);
      if (!hasTerm(clause, secret)) return;
      const hasPhone = facts.phones.some((p) => p.span.start >= r.start && p.span.end <= r.end);
      const own = hasTerm(clause, verbs);
      if (hasPhone && own) {
        found.add('asks_pin');
        return;
      }
      if (hasTerm(clause, neg)) return;
      // The verb may sit in the clause just before ("envoyez 10 000 FCFA de frais et votre code PIN").
      const prev = ranges[i - 1];
      const prevText = prev ? n.slice(prev.start, prev.end) : '';
      if (own || (prev && hasTerm(prevText, verbs) && !hasTerm(prevText, neg))) found.add('asks_pin');
    });
  }

  const received = hasTerm(n, S((s) => s.moneyReceived));
  if (
    hasTerm(n, S((s) => s.mistakeWords)) &&
    (hasTerm(n, S((s) => s.returnWords)) || (facts.amounts.length > 0 && received))
  )
    found.add('wrong_transfer');
  const callHits = findTerms(n, S((s) => s.callWords));
  const officialNumbers = new Set(
    region.officialSenders.flatMap((o) => [o.helpline, ...o.shortCodes]).filter((x): x is string => !!x).map((x) => digitsOf(x).slice(-9)),
  );
  const isOfficialNumber = (v: string) => officialNumbers.has(digitsOf(v).slice(-9));
  // Verification whitelists only the official numbers; any other number is a personal number whoever sent the text.
  const personalPhones = facts.phones.filter((p) => !isOfficialNumber(p.value));
  if (hasTerm(n, S((s) => s.prizeWords))) {
    // A prize that must be claimed by paying, or by calling a personal number, is a trap.
    const callsNumber = callHits.length > 0 && personalPhones.length > 0;
    if (hasTerm(n, S((s) => s.feeWords)) || callsNumber) found.add('prize_fee');
  }
  // Family impersonation ("j'ai changé de numéro" + rush or money) and the emergency story (accident / hospital
  // + call a personal number) from a sender that is not verified.
  if (!sender.verified) {
    if (hasTerm(n, S((s) => s.numberChangeWords))) {
      const rush = hasTerm(n, S((s) => s.timePressure)) || hasTerm(n, collect(lexicons, (l) => l.urgency.urgent));
      const asksMoney = facts.amounts.length > 0 && hasTerm(n, S((s) => s.payVerbs));
      if (rush || asksMoney) found.add('time_pressure');
    }
    if (hasTerm(n, S((s) => s.emergencyWords)) && callHits.length > 0 && personalPhones.length > 0)
      found.add('asks_to_call_number');
  }
  if (hasTerm(n, S((s) => s.blockThreats))) found.add('account_block_threat');
  if (facts.urls.length > 0) found.add('link');
  if (hasTerm(n, S((s) => s.timePressure))) found.add('time_pressure');
  if (claimedSenderId && !sender.verified && isOrdinaryNumber(input)) found.add('sender_mismatch');
  if (received && facts.amounts.length > 0 && !sender.verified && isOrdinaryNumber(input)) found.add('fake_balance');

  // pay_to_personal_number: an amount, a pay/send verb and an ordinary phone number together.
  if (personalPhones.length > 0 && facts.amounts.length > 0) {
    const payHits = findTerms(n, S((s) => s.payVerbs));
    const recv = findTerms(n, S((s) => s.moneyReceived));
    const contactHits = findTerms(n, collect(lexicons, (l) => l.contactWords));
    const sens = splitSentences(n);
    const sentenceOf = (pos: number) => sens.find((x) => pos >= x.start && pos < x.end);
    const WIN = 80;
    for (const p of personalPhones) {
      // A number that merely names who sent money is not a number to pay.
      if (recv.some((w) => w.end <= p.span.start && p.span.start - w.end <= 30)) continue;
      const amountNear = facts.amounts.some((a) => (a.span.end <= p.span.start ? p.span.start - a.span.end : a.span.start - p.span.end) <= WIN);
      if (!amountNear) continue;
      const sen = sentenceOf(p.span.start);
      const inSentence = payHits.some((v) => sen && v.start >= sen.start && v.end <= sen.end);
      const calledOnly = [...callHits, ...contactHits].some((w) => w.end <= p.span.start && p.span.start - w.end <= 40);
      // In another sentence the verb must be close: "est à payer avant le 20/11 au bureau. Info: 699..." is not a payment number.
      const verbNear = payHits.some((v) => (v.end <= p.span.start ? p.span.start - v.end : v.start - p.span.end) <= 40);
      if (inSentence || (!calledOnly && verbNear)) {
        found.add('pay_to_personal_number');
        break;
      }
    }
  }

  // ussd_instruction: a *...# code, or a dial instruction, from a sender that is not verified.
  // Not an instruction by itself: an official sender's own balance code, and a bare *NNN# / #NNN# (a menu or
  // balance shortcut: renew, check the balance) with no money-purpose word and no amount/phone inside.
  let strongUssd = false;
  if (!sender.verified) {
    const codes = facts.ussdCodes.filter((u) => /^[*#]/.test(u.value));
    const dial = findTerms(n, S((s) => s.dialWords));
    const purpose = findTerms(n, S((s) => s.ussdPurposeWords));
    const balanceHits = findTerms(n, collect(lexicons, (l) => l.balanceWords));
    const balanceCodes = new Set(region.officialSenders.map((o) => o.balanceCode?.replace(/\s/g, '')).filter((x): x is string => !!x));
    const dialsNear = (u: { span: { start: number } }) =>
      dial.some((w) => w.end <= u.span.start && u.span.start - w.end <= 40);
    for (const u of codes) {
      if (balanceCodes.has(u.value)) continue;
      const segs = u.value.split(/[*#]+/).filter(Boolean);
      const carries = segs.some((x) => /^\d{4,}$/.test(x)); // a phone (9 digits) or an amount (4+ digits)
      const why = purpose.some((w) => (w.end <= u.span.start ? u.span.start - w.end : w.start - u.span.end) <= 100);
      const bare = /^[*#]\d{1,3}#$/.test(u.value);
      // An amount of money written right next to the code ("Renouvelez 25 000 FCFA via *888#") is a money purpose;
      // a balance figure ("Nouveau solde: 23 450 FCFA. Composez *126#") is not.
      const moneyNear = facts.amounts.some(
        (a) =>
          (a.span.end <= u.span.start ? u.span.start - a.span.end : a.span.start - u.span.end) <= 40 &&
          !balanceHits.some((w) => w.end <= a.span.start && a.span.start - w.end <= 30),
      );
      if (bare && !why && !carries && !moneyNear) continue;
      if (carries || (dialsNear(u) && why)) strongUssd = true;
      found.add('ussd_instruction');
    }
  }

  // asks_to_call_number: asks to call a number that is not the claimed sender's helpline.
  if (callHits.length > 0 && facts.phones.length > 0) {
    const helpline = region.officialSenders.find((o) => o.id === claimedSenderId)?.helpline;
    const h = helpline ? digitsOf(helpline).slice(-9) : undefined;
    const recvHits = findTerms(n, S((s) => s.moneyReceived));
    // A number that merely names who sent money ("reçu de JEAN (677123456)") is not a number to call.
    const named = (p: { span: { start: number } }) => recvHits.some((w) => w.end <= p.span.start && p.span.start - w.end <= 30);
    const foreign = facts.phones.some((p) => !named(p) && (!h || digitsOf(p.value).slice(-9) !== h));
    if (foreign && ((claimedSenderId && !sender.verified) || found.size > 0)) found.add('asks_to_call_number');
  }

  const signals = SCAM_SIGNALS.filter((s) => found.has(s));
  const level =
    strongUssd || signals.some((s) => STRONG.includes(s)) || signals.length >= 2
      ? 'likely_scam'
      : signals.length === 1
        ? 'caution'
        : 'no_signs';
  return claimedSenderId ? { level, signals, claimedSenderId } : { level, signals };
}
