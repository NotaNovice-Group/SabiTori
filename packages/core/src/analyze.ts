import type { Card, Classifier, MessageInput } from './types.js';
import type { RegionConfig } from './region.js';
import type { ReadingLexicon } from './reading.js';
import { extractFacts } from './facts.js';
import { matchSender } from './sender.js';
import { assessScam } from './scam.js';
import { createRulesClassifier } from './classifier.js';
import { buildCard } from './card.js';

export async function analyze(
  input: MessageInput,
  deps: { region: RegionConfig; lexicons: ReadingLexicon[]; classifier?: Classifier },
): Promise<Card> {
  const { region, lexicons } = deps;
  const facts = extractFacts(input.text, { region, lexicons, receivedAt: input.receivedAt });
  const rules = createRulesClassifier(region, lexicons);
  let understanding;
  try {
    understanding = await (deps.classifier ?? rules).classify(input, facts);
  } catch {
    understanding = await rules.classify(input, facts);
  }
  const { sender } = matchSender(input, region, lexicons);
  const scam = assessScam(input, facts, region, lexicons);
  return buildCard({ input, facts, understanding, scam, sender, lexicons });
}
