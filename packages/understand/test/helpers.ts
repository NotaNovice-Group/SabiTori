import type { Classifier, Facts, MessageInput, Understanding } from '@sabitori/core';
import { emptyFacts } from '../src/index.js';

export const input = (text: string): MessageInput => ({ text, source: 'paste', receivedAt: '2025-01-10', region: 'CM' });
export const facts = (): Facts => emptyFacts();
export const fallbackWith = (u: Partial<Understanding> = {}): Classifier => ({
  id: 'rules@1',
  classify: async () => ({
    kind: 'other', action: 'unclear', urgency: 'info', confidence: 0.5, producedBy: 'rules@1', ...u,
  }),
});
