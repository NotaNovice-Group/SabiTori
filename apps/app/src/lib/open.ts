import type { Card, MessageInput } from '@sabitori/core';
import type { Engine } from '../engine';

/**
 * `today` is the region's calendar day (todayIso(region.timezone)): "demain" in a message read at
 * 00:30 in Douala is the day after the local date, not the day after the UTC date.
 */
export function buildInput(text: string, source: MessageInput['source'], region: string, sender: MessageInput['sender'] | undefined, today: string): MessageInput {
  return { text, source, sender, receivedAt: today, region };
}

/**
 * Core gives a card the id of a hash of its date and text, so the same text read twice on one day would
 * overwrite the first card (and its reminder). Each read is its own card: the id gets the save time.
 */
export function uniqueCard<T extends { id: string; createdAt: string }>(card: T, now: () => number = Date.now): T {
  return { ...card, id: `${card.id}-${now().toString(36)}` };
}

/** Run the pipeline for a message. Never throws: a failed model falls back to rules inside the engine. */
export function analyzeMessage(engine: Engine, input: MessageInput): Promise<Card> {
  return engine.analyze(input);
}
