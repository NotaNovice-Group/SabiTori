import type { Card, CardSection, IsoDate, MessageKind, SpeechPlan, Utterance } from './types.js';
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
    if (u.kind === 'mobile_money' || scam.signals.includes('wrong_transfer') || scam.signals.includes('fake_balance'))
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
    else sections.sender = [{ key: 'sender.unknown' }];
    sections.about = [{ key: key(`about.${u.kind}`) }];
    if (!likely) sections.action = [{ key: key(`action.${u.action}`) }];
  }

  if (!likely) {
    if (card.deadline) {
      const date = { type: 'date' as const, value: card.deadline.value, relativeTo: today };
      sections.deadline = [{ key: card.deadline.value < today ? 'deadline.passed' : 'deadline.by', slots: { date } }];
    }
    if (card.amount) sections.money = [{ key: 'money.amount', slots: { amount: { type: 'money', value: card.amount.value } } }];
  }
  sections.help = card.contactPhone
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
