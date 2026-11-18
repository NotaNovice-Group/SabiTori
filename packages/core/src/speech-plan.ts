import type { Card, CardSection, IsoDate, MessageKind, SlotValue, SpeechPlan, Utterance } from './types.js';
import { CARD_SECTIONS } from './types.js';
import type { PhraseKey } from './catalog.js';

const MONEY_KINDS: MessageKind[] = ['mobile_money', 'bank', 'telecom', 'electricity_bill', 'water_bill'];
const key = (k: string) => k as PhraseKey;

/**
 * Language-neutral plan. For a likely scam the message's own instructions
 * (action, deadline, amount, urgency) are NOT spoken: they are the trap.
 */
export function buildSpeechPlan(card: Card, opts: { today?: IsoDate } = {}): SpeechPlan {
  const today = opts.today ?? card.input.receivedAt;
  const { scam, sender, understanding: u } = card;
  const factsOnly = card.mode === 'facts_only';
  const likely = scam.level === 'likely_scam';
  const caution = scam.level === 'caution';
  // Under caution a claimed (unverified) sender with an amount next to a personal number may be the
  // trap itself: say no money or deadline either.
  const trapShape =
    caution && !!scam.claimedSenderId && !sender.verified && card.facts.amounts.length > 0 && card.facts.phones.length > 0;
  const sections: Partial<Record<CardSection, Utterance[]>> = {};

  // scam
  const s: Utterance[] = [];
  if (scam.level === 'likely_scam') s.push({ key: 'scam.likely' });
  else if (scam.level === 'caution') s.push({ key: 'scam.caution' });
  else if (!factsOnly && MONEY_KINDS.includes(u.kind)) s.push({ key: 'scam.no_signs' });
  if (scam.level !== 'no_signs') {
    for (const sig of scam.signals) {
      const slots =
        sig === 'sender_mismatch'
          ? {
              sender: {
                type: 'sender' as const,
                ...(scam.claimedSenderId ? { officialId: scam.claimedSenderId } : {}),
              },
            }
          : undefined;
      s.push({ key: key(`scam.signal.${sig}`), ...(slots ? { slots } : {}) });
    }
    // Keyed on what the rules read (or the signals), never only on a learned classifier's kind.
    if ((card.rulesKind ?? u.kind) === 'mobile_money' || scam.signals.includes('wrong_transfer') || scam.signals.includes('fake_balance'))
      s.push({ key: 'scam.check_balance' });
  }
  if (s.length) sections.scam = s;

  if (factsOnly) {
    sections.about = [{ key: 'facts_only.intro' }];
  } else {
    // sender
    if (sender.verified)
      sections.sender = [
        {
          key: 'sender.known',
          slots: {
            sender: {
              type: 'sender',
              ...(sender.officialId ? { officialId: sender.officialId } : {}),
              ...(sender.displayName ? { fallbackText: sender.displayName } : {}),
            },
          },
        },
      ];
    else if (scam.claimedSenderId)
      sections.sender = [
        { key: 'sender.claimed', slots: { sender: { type: 'sender', officialId: scam.claimedSenderId } } },
      ];
    // The phone showed a name (an SMS sender ID, a WhatsApp contact): say it, as a claim. Names can be faked, so it is
    // never "is from"; a number or no sender at all stays unknown.
    else if (namedSender(card))
      sections.sender = [{ key: 'sender.claimed', slots: { sender: { type: 'sender', fallbackText: namedSender(card)! } } }];
    else sections.sender = [{ key: 'sender.unknown' }];
    sections.about = [{ key: key(`about.${u.kind}`) }];
    // Under caution the message's own call or reply instruction is not repeated.
    if (!likely && !(caution && (u.action === 'call' || u.action === 'reply')))
      sections.action = [{ key: key(`action.${u.action}`) }];
  }

  if (!likely && !trapShape) {
    if (card.deadline) {
      const date = { type: 'date' as const, value: card.deadline.value, relativeTo: today };
      // Going somewhere (an appointment, a convocation) happens ON the date; anything else is done BY it.
      const goes = card.mode === 'full' && card.understanding.action === 'go_to_place';
      // A notice that asks for nothing (a planned cut, a closure) has a date, not a deadline.
      const nothingToDo = card.mode === 'full' && card.understanding.action === 'nothing';
      const t = goes && card.deadlineTime ? card.deadlineTime.value.split(':').map(Number) : undefined;
      sections.deadline = card.deadlineFrom
        ? [{ key: 'deadline.from', slots: { date } }]
        : card.deadline.value < today
          ? [{ key: 'deadline.passed', slots: { date } }]
          : t
            ? [timeUtterance(date, t[0]!, t[1]!)]
              : [{ key: goes ? 'deadline.on' : nothingToDo ? 'deadline.date' : 'deadline.by', slots: { date } }];
    }
    if (card.amount) sections.money = [{ key: 'money.amount', slots: { amount: { type: 'money', value: card.amount.value } } }];
  }
  // Never a phone in facts_only mode; under caution only the number of a verified sender.
  const speakPhone = !!card.contactPhone && !factsOnly && (!caution || sender.verified);
  sections.help = speakPhone && card.contactPhone
    ? [{ key: 'help.call', slots: { phone: { type: 'phone', value: card.contactPhone.value } } }]
    : [{ key: 'help.none' }];
  if (!factsOnly && !likely) sections.urgency = [{ key: key(`urgency.${u.urgency}`) }];

  return {
    sections: CARD_SECTIONS.filter((c) => sections[c]?.length).map((c) => ({
      section: c,
      utterances: sections[c] as Utterance[],
    })),
  };
}

/** The sender name the phone showed, cleaned and capped, or undefined for a number or no sender. */
function namedSender(card: Card): string | undefined {
  const s = card.input.sender;
  if (!s || s.kind !== 'name') return undefined;
  const v = (s.value ?? '').replace(/\s+/g, ' ').trim();
  if (!v || /^\+?[\d\s().-]+$/.test(v)) return undefined;
  return v.length > 40 ? v.slice(0, 40).trimEnd() : v;
}

/**
 * The appointment time as people say it: the 12-hour clock with the part of the day (English "p.m.", French "de
 * l'après-midi" / "du soir"); the morning keeps the plain hour.
 */
function timeUtterance(date: Extract<SlotValue, { type: 'date' }>, hour: number, minute: number): Utterance {
  const part = hour < 12 ? '' : hour < 18 ? '_pm' : '_eve';
  const h12 = hour === 0 ? 0 : hour > 12 ? hour - 12 : hour;
  const hourSlot: SlotValue = { type: 'number', value: h12 };
  return minute
    ? { key: `deadline.on_at${part}` as PhraseKey, slots: { date, hour: hourSlot, minutes: { type: 'number', value: minute } } }
    : { key: `deadline.on_at_hour${part}` as PhraseKey, slots: { date, hour: hourSlot } };
}
