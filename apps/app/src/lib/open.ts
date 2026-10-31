import type { Card, MessageInput } from '@sabitori/core';
import type { Engine } from '../engine';

export function buildInput(text: string, source: MessageInput['source'], region: string, sender?: MessageInput['sender'], today?: string): MessageInput {
  return { text, source, sender, receivedAt: today ?? new Date().toISOString().slice(0, 10), region };
}

/** Run the pipeline for a message. Never throws: a failed model falls back to rules inside the engine. */
export function analyzeMessage(engine: Engine, input: MessageInput): Promise<Card> {
  return engine.analyze(input);
}
