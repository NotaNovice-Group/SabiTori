import type { Card, Classifier, MessageInput } from './types.js';
import type { RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import { extractFacts } from './facts.js';
import { matchSender } from './sender.js';
import { assessScam } from './scam.js';
import { createRulesClassifier } from './classifier.js';
import { buildCard } from './card.js';
import { isIsoDate } from './text.js';

export async function analyze(
  input: MessageInput,
  deps: { region: RegionConfig; lexicons: ReadingLexicon[]; classifier?: Classifier },
): Promise<Card> {
  const { region, lexicons } = deps;
  // An invalid receivedAt yields no relative / weekday / year-less dates (extractFacts skips them). The rest of
  // the pipeline compares dates, so it works from today (UTC) instead of from garbage.
  const facts = extractFacts(input.text, { region, lexicons, receivedAt: input.receivedAt });
  if (!isIsoDate(input.receivedAt)) input = { ...input, receivedAt: new Date().toISOString().slice(0, 10) };
  const rules = createRulesClassifier(region, lexicons);
  const rulesU = await rules.classify(input, facts);
  let understanding = rulesU;
  if (deps.classifier) {
    try {
      understanding = await deps.classifier.classify(input, facts);
    } catch {
      understanding = rulesU;
    }
  }
  const { sender } = matchSender(input, region, lexicons);
  const scam = assessScam(input, facts, region, lexicons);
  return buildCard({ input, facts, understanding, scam, sender, lexicons, region, ...(understanding !== rulesU ? { rules: rulesU } : {}) });
}
