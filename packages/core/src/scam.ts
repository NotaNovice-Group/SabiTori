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
  'promised_return',
  'offer_fee',
];
const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Congratulation words: on their own they open real exam results, not prizes. */
const CONGRATS = /^(?:felicitations?|congratulations?|congrats)$/;

/**
 * A message from an ordinary mobile number that opens with an organisation's short name in capitals ("SGC: ...",
 * "UBA: ...") claims to be that organisation; real organisations send from their sender name. Words a person
 * may put first ("URGENT:", "INFO:") do not count.
 */
const NOT_ORG = new Set(['URGENT', 'INFO', 'INFOS', 'ATTENTION', 'RAPPEL', 'IMPORTANT', 'NB', 'PS', 'OBJET', 'RE', 'TR', 'FWD', 'SVP', 'STP', 'OK', 'NOTE', 'ALERT', 'ALERTE', 'NEW', 'TOP', 'HELLO', 'BONJOUR', 'SALUT', 'MERCI']);
function claimsOrgPrefix(text: string): boolean {
  const m = /^\s*([A-Z][A-Z&.\-]{1,11}(?: [A-Z][A-Z&.\-]{1,11})?)\s*:/.exec(text);
  return !!m && !NOT_ORG.has(m[1]!.replace(/[.\-&]/g, ''));
}

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
      // The secret phrase itself never counts as the asking verb ("code de confirmation", "verification code"):
      // blank it out first, so a code being delivered ("your confirmation code is 482913") is not a request.
      const asked = findTerms(clause, secret).reduce((c, h) => c.slice(0, h.start) + ' '.repeat(h.end - h.start) + c.slice(h.end), clause);
      const own = hasTerm(asked, verbs);
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

  // "I sent a 6-digit code to your number by mistake. Please forward it to me": the code is named in one sentence and
  // asked back in another. A code, a mistake and a send-it-back request that is not a warning ask for the secret.
  if (!found.has('asks_pin') && hasTerm(n, secret) && hasTerm(n, S((s) => s.mistakeWords))) {
    // A warning ("Someone may say they sent you a code by mistake and ask for it back. Never do it.") puts its "never"
    // in the same or the next sentence.
    const back = S((s) => s.returnWords);
    const sens = splitSentences(n);
    const asksBack = sens.some(
      (x, i) =>
        hasTerm(n.slice(x.start, x.end), back) &&
        !hasTerm(n.slice(x.start, sens[i + 1]?.end ?? x.end), neg),
    );
    if (asksBack) found.add('asks_pin');
  }

  const received = hasTerm(n, S((s) => s.moneyReceived));
  // An operator's warning ("Someone may say they sent you money by mistake and ask you to send it back. Never do it.")
  // names the trick: from a sender shown as a name, a return request with "never" in its sentence or the next is not one.
  const backWords = S((s) => s.returnWords);
  const sensAll = splitSentences(n);
  const warnsOnly =
    input.sender?.kind === 'name' &&
    sensAll.every((x, i) => !hasTerm(n.slice(x.start, x.end), backWords) || hasTerm(n.slice(x.start, sensAll[i + 1]?.end ?? x.end), neg));
  if (
    hasTerm(n, S((s) => s.mistakeWords)) &&
    ((hasTerm(n, backWords) && !warnsOnly) || (facts.amounts.length > 0 && received))
  )
    found.add('wrong_transfer');
  const callHits = findTerms(n, S((s) => s.callWords));
  const officialNumbers = new Set(
    region.officialSenders.flatMap((o) => [o.helpline, ...o.shortCodes]).filter((x): x is string => !!x).map((x) => digitsOf(x).slice(-9)),
  );
  const isOfficialNumber = (v: string) => officialNumbers.has(digitsOf(v).slice(-9));
  // Verification whitelists only the official numbers; any other number is a personal number whoever sent the text.
  const personalPhones = facts.phones.filter((p) => !isOfficialNumber(p.value));
  const prizeHits = findTerms(n, S((s) => s.prizeWords));
  if (prizeHits.length > 0) {
    // A prize that must be claimed by paying, or by calling a personal number, is a trap.
    const callsNumber = callHits.length > 0 && personalPhones.length > 0;
    // "Félicitations" / "congratulations" alone is how real exam and school results start; it is a prize only when a
    // fee is asked in the same sentence. Any other prize word ("vous avez gagné", "lottery") keeps the wider rule.
    const realPrize = prizeHits.some((h) => !CONGRATS.test(h.term));
    const feeHits = findTerms(n, S((s) => s.feeWords));
    const sens = splitSentences(n);
    const sameSentence = prizeHits.some((h) => {
      const sen = sens.find((x) => h.start >= x.start && h.start < x.end);
      return !!sen && feeHits.some((f) => f.start >= sen.start && f.end <= sen.end);
    });
    if ((realPrize && (feeHits.length > 0 || callsNumber)) || sameSentence) found.add('prize_fee');
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
  // A code that is delivered ("Votre code OTP est 739204. Il expire dans 5 minutes") says when it expires: that is not
  // pressure. Expiry wording counts only when the message does not deliver a code; any other rush word still counts.
  const pressure = findTerms(n, S((s) => s.timePressure));
  const deliversCode = findTerms(n, S((s) => s.secretWords)).some((h) => /^[^\d]{0,25}\d{4,8}(?!\d)/.test(n.slice(h.end, h.end + 40)));
  const expiry = [...n.matchAll(/expir/g)].map((m) => m.index!);
  const aboutExpiry = (h: { start: number; term: string }) => /expir/.test(h.term) || expiry.some((e) => e <= h.start && h.start - e <= 20);
  if (pressure.some((h) => !(deliversCode && aboutExpiry(h)))) found.add('time_pressure');
  if ((claimedSenderId || claimsOrgPrefix(input.text)) && !sender.verified && isOrdinaryNumber(input)) found.add('sender_mismatch');
  if (received && facts.amounts.length > 0 && !sender.verified && isOrdinaryNumber(input)) found.add('fake_balance');

  // pay_to_personal_number: an amount, a pay/send verb and an ordinary phone number together.
  if (personalPhones.length > 0 && facts.amounts.length > 0) {
    // "Envoyez votre CV au 677...": a send verb whose object is a document, not money, is not a payment.
    const docs = S((s) => s.documentObjects ?? []);
    const payHits = findTerms(n, S((s) => s.payVerbs)).filter((v) => !findTerms(n.slice(v.end, v.end + 30), docs).some((d) => d.start <= 2));
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

  // "Send 20,000 FCFA to this number" from an ordinary mobile number: the number is the sender's own, unwritten.
  if (!found.has('pay_to_personal_number') && facts.amounts.length > 0 && !sender.verified && isOrdinaryNumber(input)) {
    const here = findTerms(n, S((s) => s.thisNumberWords ?? []));
    const pays = findTerms(n, S((s) => s.payVerbs));
    const sens = splitSentences(n);
    const together = sens.some(
      (x) =>
        here.some((h) => h.start >= x.start && h.end <= x.end) &&
        pays.some((v) => v.start >= x.start && v.end <= x.end) &&
        facts.amounts.some((a) => a.span.start >= x.start && a.span.end <= x.end),
    );
    if (together) found.add('pay_to_personal_number');
  }

  // promised_return: "invest 50 000, receive 200 000 in 7 days", or "double your money". A sender that promises
  // money grows fast is the trap whoever sends it (no real bank or tontine does), so a verified name does not excuse it.
  {
    const promise = hasTerm(n, S((s) => s.returnPromises ?? []));
    const invest = findTerms(n, S((s) => s.investWords ?? []));
    const back = findTerms(n, S((s) => s.gainWords ?? []));
    const multiplies =
      invest.length > 0 &&
      facts.amounts.some((a) =>
        invest.some((i) => Math.abs(a.span.start - i.end) <= 40) &&
        facts.amounts.some(
          (b) => b.span.start > a.span.end && b.value.amount >= 1.5 * a.value.amount && back.some((r) => r.end <= b.span.start && b.span.start - r.end <= 30 && r.start > a.span.end),
        ),
      );
    if (promise || multiplies) found.add('promised_return');
  }

  // offer_fee: a job, a place, a scholarship, a visa or a loan said to be granted, with a fee and an amount in one
  // sentence, and a personal number to pay or call (written, or "this number" from a mobile). Real recruiters,
  // schools and lenders take fees at a bank or an office; a real admission notice with no personal number is not caught.
  const thisNumberHits = findTerms(n, S((s) => s.thisNumberWords ?? []));
  const toThisNumber = isOrdinaryNumber(input) && thisNumberHits.length > 0;
  const sentences = splitSentences(n);
  const within = (h: { start: number; end: number }, x: { start: number; end: number }) => h.start >= x.start && h.end <= x.end;
  if (!sender.verified && hasTerm(n, S((s) => s.offerWords ?? [])) && (personalPhones.length > 0 || toThisNumber)) {
    // A fee word that is only a send/pay verb does not count here: "send your CV to 677..." next to a salary is a real
    // job advert; a fee noun ("frais", "fee", "pour garantir votre place") is what makes it a charge.
    const verbs = findTerms(n, S((s) => s.payVerbs ?? []));
    const fees = findTerms(n, S((s) => s.feeWords)).filter((f) => !verbs.some((v) => v.start < f.end && f.start < v.end));
    const charged = sentences.some(
      (x) =>
        fees.some((f) => within(f, x)) &&
        facts.amounts.some((a) => within(a.span, x)) &&
        !hasTerm(n.slice(x.start, x.end), neg),
    );
    if (charged) found.add('offer_fee');
  }

  // distress_money: an accident, an arrest or someone stranded abroad, and money asked in the same sentence, from a
  // mobile number (or to a personal number). Real family emergencies are written the same way, so this is a caution
  // on its own: the advice is to call the person back on the number you already know.
  if (!sender.verified && (isOrdinaryNumber(input) || personalPhones.length > 0)) {
    const story = hasTerm(n, S((s) => s.emergencyWords ?? [])) || hasTerm(n, S((s) => s.distressWords ?? []));
    if (story) {
      const pays = findTerms(n, S((s) => s.payVerbs ?? []));
      const asks = sentences.some(
        (x) =>
          pays.some((v) => within(v, x)) &&
          (facts.amounts.some((a) => within(a.span, x)) || thisNumberHits.some((h) => within(h, x))) &&
          !hasTerm(n.slice(x.start, x.end), neg),
      );
      if (asks) found.add('distress_money');
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
    // Nor does the number of the person the user sent money to ("Vous avez envoyé 41 100 FCFA à SAMUEL FOTSO
    // (677465100)"): same sentence, close after the "sent" words, with no call or pay word in between.
    const sentHits = findTerms(n, S((s) => s.moneySent ?? []));
    const payHits = findTerms(n, S((s) => s.payVerbs));
    const sens = splitSentences(n);
    const sameSentence = (a: number, b: number) => sens.some((x) => a >= x.start && a < x.end && b >= x.start && b < x.end);
    const paidTo = (p: { span: { start: number } }) =>
      sentHits.some(
        (w) =>
          w.end <= p.span.start &&
          p.span.start - w.end <= 60 &&
          sameSentence(w.start, p.span.start) &&
          ![...callHits, ...payHits].some((c) => c.start >= w.end && c.end <= p.span.start),
      );
    const named = (p: { span: { start: number } }) =>
      recvHits.some((w) => w.end <= p.span.start && p.span.start - w.end <= 30) || paidTo(p);
    // A fixed line in a message whose sender the phone showed as a name is how a utility or a hospital gives its
    // switchboard. The trap is a personal mobile number; a message from a mobile number is caught by sender_mismatch,
    // and a pasted text with no sender keeps the caution (nothing says who wrote it).
    const mobile = region.phone.mobilePrefixes ?? ['6'];
    const fixedFromName = (p: { value: string }) => input.sender?.kind === 'name' && !mobile.some((m) => digitsOf(p.value).slice(-9).startsWith(m));
    const foreign = facts.phones.some((p) => !named(p) && !fixedFromName(p) && (!h || digitsOf(p.value).slice(-9) !== h));
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
