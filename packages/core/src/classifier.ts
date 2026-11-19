import type {
  ActionKind,
  Classifier,
  Facts,
  MessageInput,
  MessageKind,
  Understanding,
  Urgency,
  UrgencyCues,
} from './types.js';
import { MESSAGE_KINDS } from './types.js';
import type { RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import { collect, countTerms, daysBetween, fold, hasTerm } from './text.js';
import { channelSpans, matchSender } from './sender.js';

/** A dated task within this many days is urgent (day 7 counts): the card's calibration and the eval labels. */
const URGENT_WITHIN_DAYS = 7;

/** Actions that are a task with a time attached (a deadline makes them urgent or soon). */
const TASKS: readonly ActionKind[] = ['pay', 'collect', 'go_to_place', 'bring_document', 'call', 'reply', 'take_medicine', 'unclear'];

/**
 * "within 3 days", "sous 48h", "dans les 5 jours", "d'ici 24 heures": the shortest stated delay, in days
 * (hours and minutes count as 0). Undefined when the text states none. Works on folded text (no accents).
 */
export function withinDays(folded: string): number | undefined {
  const re = /\b(?:within|in|inside|under|sous|dans(?: les)?|d'ici|d ici|en)\s+(\d{1,3})\s*(h\b|hrs?\b|hours?\b|heures?\b|min\b|mins?\b|minutes?\b|jours?\b|days?\b|j\b|weeks?\b|semaines?\b)/g;
  let best: number | undefined;
  for (const m of folded.matchAll(re)) {
    const v = Number(m[1]);
    const u = m[2]!;
    const d = /^(h|hr|hrs|hour|hours|heure|heures|min|mins|minute|minutes)$/.test(u) ? 0 : /^(week|weeks|semaine|semaines)$/.test(u) ? v * 7 : v;
    if (best === undefined || d < best) best = d;
  }
  return best;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

/**
 * Deadlines the fact extractor does not turn into dates, used only to judge urgency (never shown as a fact):
 * a bare weekday ("come Monday", "d'ici vendredi": its next occurrence), "J-3", a day and month without a year
 * ("20/09"), "the 20th" / "le 20" (next such day), "end of the month" / "fin du mois", and "before 6pm" /
 * "avant 17h" (today). Days from receivedAt; may be negative for a day/month already past this year.
 */
export function extraDays(folded: string, receivedAt: string): number[] {
  const out: number[] = [];
  const base = new Date(`${receivedAt}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return out;
  const dow = base.getUTCDay();
  for (const m of folded.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\b/g)) {
    const d = (WEEKDAYS[m[1]!]! - dow + 7) % 7;
    out.push(d === 0 ? 7 : d);
  }
  for (const m of folded.matchAll(/\bj\s?-\s?(\d{1,2})\b/g)) out.push(Number(m[1]));
  const day = (y: number, mo: number, d: number) => Math.round((Date.UTC(y, mo, d) - base.getTime()) / 86_400_000);
  const y = base.getUTCFullYear();
  for (const m of folded.matchAll(/(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})(?![\d/-]|\.\d|\s?(?:fcfa|f\b|xaf|frs?\b))/g)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      let v = day(y, mo - 1, d);
      if (v < -180) v = day(y + 1, mo - 1, d);
      out.push(v);
    }
  }
  for (const m of folded.matchAll(/\b(?:the|le|du|au|before the|avant le)\s+(\d{1,2})(?:st|nd|rd|th|er)?\b(?!\s*(?:\/|-|\.|\d|h\b|heures?|hours?|fcfa|f\b|xaf|frs?|000|jours?|days?|janv|fev|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep))/g)) {
    const d = Number(m[1]);
    if (d < 1 || d > 31) continue;
    let v = day(y, base.getUTCMonth(), d);
    if (v < 0) v = day(y, base.getUTCMonth() + 1, d);
    out.push(v);
  }
  if (/\b(?:end of (?:the |this )?month|month end|fin du mois|fin de ce mois|fin (?:de |du )?mois)\b/.test(folded)) {
    out.push(day(y, base.getUTCMonth() + 1, 0));
  }
  if (/\b(?:before|avant|by)\s+\d{1,2}\s*(?:h\b|pm\b|am\b|heures?\b|o.?clock)/.test(folded)) out.push(0);
  return out;
}

/**
 * Urgency from evidence, following the labelling rules (packages/understand/eval/README.md):
 * urgent = a task due within 7 days (day 7 counts), already overdue, or said to be now/today/within hours;
 * soon = a task with a date further away; info = no task, or no deadline at all.
 */
export function decideUrgency(e: UrgencyCues & { action: ActionKind }): Urgency {
  // A promotion is never urgent unless a real task is named ("pay", "collect"...), as in the rules' own action.
  if (!TASKS.includes(e.action) || (e.promo && !['pay', 'collect', 'go_to_place', 'bring_document', 'take_medicine'].includes(e.action))) return 'info';
  // A stated delay or date decides; alarm words ("coupure", "final notice") only count when the text gives no time.
  if (e.withinDays !== undefined) return e.withinDays <= URGENT_WITHIN_DAYS ? 'urgent' : 'soon';
  const future = e.days.filter((x) => x >= 0);
  if (future.length) return Math.min(...future) <= URGENT_WITHIN_DAYS ? 'urgent' : 'soon';
  if (e.days.some((x) => x < 0)) return 'urgent'; // only past dates next to a task: it is overdue
  return e.urgentWord ? 'urgent' : 'info';
}

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
  const promoIn = (n: string): boolean => hasTerm(n, collect(lexicons, (l) => l.promoWords));
  const cuesOf = (input: MessageInput, facts: Facts, n: string, promo: boolean): UrgencyCues => {
    const within = withinDays(n);
    return {
      // The extra cues only count when the extractor found no full date (a weekday next to a date is that date).
      days: facts.dates.length ? facts.dates.map((d) => daysBetween(input.receivedAt, d.value)) : extraDays(n, input.receivedAt),
      urgentWord: hasTerm(n, collect(lexicons, (l) => l.urgency.urgent)),
      ...(within !== undefined ? { withinDays: within } : {}),
      promo,
    };
  };
  return {
    urgencyCues(input: MessageInput, facts: Facts): UrgencyCues {
      const n = fold(input.text);
      return cuesOf(input, facts, n, promoIn(n));
    },
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
        promoIn(n) &&
        !(a.key && ['pay', 'collect', 'go_to_place', 'bring_document', 'take_medicine'].includes(a.key));
      const action: ActionKind = promo ? 'nothing' : (a.key ?? 'unclear');
      if (!a.key && !promo) confidence *= 0.85;

      const urgency = decideUrgency({ ...cuesOf(input, facts, n, promo), action });

      return { kind, action, urgency, confidence: Math.round(confidence * 100) / 100, producedBy: 'rules@1' };
    },
  };
}
