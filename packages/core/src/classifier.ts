import type {
  ActionKind,
  Classifier,
  Facts,
  MessageInput,
  MessageKind,
  Understanding,
  Urgency,
} from './types.js';
import { MESSAGE_KINDS } from './types.js';
import type { RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import { collect, countTerms, daysBetween, fold, hasTerm } from './text.js';
import { channelSpans, matchSender } from './sender.js';

/** A dated task within this many days is urgent (day 7 counts): the card's calibration and the eval labels. */
const URGENT_WITHIN_DAYS = 7;

/** Order used to break ties between actions with the same score. */
const ACTION_PRIORITY: ActionKind[] = [
  'pay',
  'collect',
  'go_to_place',
  'bring_document',
  'call',
  'reply',
  'take_medicine',
  'nothing',
];

function pickBest<K extends string>(scores: Map<K, number>, order: readonly K[]): { key?: K; top: number; second: number } {
  let key: K | undefined;
  let top = 0;
  let second = 0;
  for (const k of order) {
    const s = scores.get(k) ?? 0;
    if (s > top) {
      second = top;
      top = s;
      key = k;
    } else if (s > second) second = s;
  }
  return key === undefined ? { top: 0, second: 0 } : { key, top, second };
}

export function createRulesClassifier(region: RegionConfig, lexicons: ReadingLexicon[] = []): Classifier {
  return {
    id: 'rules@1',
    async classify(input: MessageInput, facts: Facts): Promise<Understanding> {
      const n = fold(input.text);

      // Payment channels named in the text ("via Orange Money ou MTN MoMo") do not say what it is about.
      let nk = n;
      for (const c of channelSpans(input, region, lexicons)) nk = nk.slice(0, c.start) + ' '.repeat(c.end - c.start) + nk.slice(c.end);
      const kindScores = new Map<MessageKind, number>();
      for (const kind of MESSAGE_KINDS) {
        if (kind === 'other') continue;
        const s = countTerms(nk, collect(lexicons, (l) => l.kinds[kind]));
        if (s) kindScores.set(kind, s);
      }
      const { claimedSenderId } = matchSender(input, region, lexicons);
      const claimed = region.officialSenders.find((o) => o.id === claimedSenderId);
      // The company the message is from outweighs payment channels it names ("via Orange Money").
      if (claimed && claimed.kind !== 'other') kindScores.set(claimed.kind, (kindScores.get(claimed.kind) ?? 0) + 2);
      const k = pickBest(kindScores, MESSAGE_KINDS);
      const kind: MessageKind = k.key ?? 'other';
      let confidence = k.key ? 0.25 + (0.75 * (k.top - k.second)) / (k.top + 1) : 0.2;

      const actionScores = new Map<ActionKind, number>();
      for (const a of ACTION_PRIORITY) {
        const s = countTerms(n, collect(lexicons, (l) => l.actions[a]));
        if (s) actionScores.set(a, s);
      }
      const a = pickBest(actionScores, ACTION_PRIORITY);
      // An operator promotion asks for nothing: it is "nothing to do", never urgent, unless the text names a real task.
      const promo =
        hasTerm(n, collect(lexicons, (l) => l.promoWords)) &&
        !(a.key && ['pay', 'collect', 'go_to_place', 'bring_document', 'take_medicine'].includes(a.key));
      const action: ActionKind = promo ? 'nothing' : (a.key ?? 'unclear');
      if (!a.key && !promo) confidence *= 0.85;

      let urgency: Urgency = 'info';
      const future = facts.dates.map((d) => daysBetween(input.receivedAt, d.value)).filter((x) => x >= 0);
      if (promo) urgency = 'info';
      // An information notice ("coupure programmée ... veuillez nous excuser") asks for nothing: its alarm words do not make it urgent.
      else if (action !== 'nothing' && hasTerm(n, collect(lexicons, (l) => l.urgency.urgent))) urgency = 'urgent';
      else if (future.length && Math.min(...future) <= URGENT_WITHIN_DAYS && action !== 'nothing') urgency = 'urgent';
      else if (action !== 'nothing' && (hasTerm(n, collect(lexicons, (l) => l.urgency.soon)) || future.length > 0))
        urgency = 'soon';

      return { kind, action, urgency, confidence: Math.round(confidence * 100) / 100, producedBy: 'rules@1' };
    },
  };
}
