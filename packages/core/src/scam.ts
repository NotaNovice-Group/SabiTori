import type { Facts, MessageInput, ScamAssessment, ScamSignal } from './types.js';
import { SCAM_SIGNALS } from './types.js';
import type { RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import { collect, findTerms, fold, hasTerm, splitSentences } from './text.js';
import { matchSender } from './sender.js';

const STRONG: ScamSignal[] = ['asks_pin', 'sender_mismatch', 'wrong_transfer', 'prize_fee', 'fake_balance'];
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
  const S = (pick: (s: ReadingLexicon['scam']) => string[]) => collect(lexicons, (l) => pick(l.scam));
  const found = new Set<ScamSignal>();
  const { sender, claimedSenderId } = matchSender(input, region, lexicons);

  // asks_pin: a sentence with a secret word AND an asking verb, not a warning.
  const secret = S((s) => s.secretWords);
  const verbs = S((s) => s.askVerbs);
  const neg = S((s) => s.negations);
  for (const sen of splitSentences(n)) {
    const part = n.slice(sen.start, sen.end);
    if (hasTerm(part, secret) && hasTerm(part, verbs) && !hasTerm(part, neg)) found.add('asks_pin');
  }

  const received = hasTerm(n, S((s) => s.moneyReceived));
  if (
    hasTerm(n, S((s) => s.mistakeWords)) &&
    (hasTerm(n, S((s) => s.returnWords)) || (facts.amounts.length > 0 && received))
  )
    found.add('wrong_transfer');
  if (hasTerm(n, S((s) => s.prizeWords)) && hasTerm(n, S((s) => s.feeWords))) found.add('prize_fee');
  if (hasTerm(n, S((s) => s.blockThreats))) found.add('account_block_threat');
  if (facts.urls.length > 0) found.add('link');
  if (hasTerm(n, S((s) => s.timePressure))) found.add('time_pressure');
  if (claimedSenderId && !sender.verified && isOrdinaryNumber(input)) found.add('sender_mismatch');
  if (received && facts.amounts.length > 0 && !sender.verified && isOrdinaryNumber(input)) found.add('fake_balance');

  // asks_to_call_number: asks to call a number that is not the claimed sender's helpline.
  if (findTerms(n, S((s) => s.callWords)).length > 0 && facts.phones.length > 0) {
    const helpline = region.officialSenders.find((o) => o.id === claimedSenderId)?.helpline;
    const h = helpline ? digitsOf(helpline).slice(-9) : undefined;
    const foreign = facts.phones.some((p) => !h || digitsOf(p.value).slice(-9) !== h);
    if (foreign && (claimedSenderId || found.size > 0)) found.add('asks_to_call_number');
  }

  const signals = SCAM_SIGNALS.filter((s) => found.has(s));
  const level =
    signals.some((s) => STRONG.includes(s)) || signals.length >= 2
      ? 'likely_scam'
      : signals.length === 1
        ? 'caution'
        : 'no_signs';
  return claimedSenderId ? { level, signals, claimedSenderId } : { level, signals };
}
