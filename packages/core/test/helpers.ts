import type { MessageInput } from '../src/types.js';
import type { RegionConfig } from '../src/region.js';
import type { ReadingLexicon } from '../src/reading.js';
import regionJson from '../../../regions/CM/region.json';
import frJson from '../../../packs/fr/reading.json';
import enJson from '../../../packs/en/reading.json';

export const region = regionJson as unknown as RegionConfig;
export const fr = frJson as unknown as ReadingLexicon;
export const en = enJson as unknown as ReadingLexicon;
export const lexicons: ReadingLexicon[] = [fr, en];
export const RECEIVED = '2026-10-31';

export const ctx = { region, lexicons, receivedAt: RECEIVED };

export function msg(text: string, sender?: MessageInput['sender'], receivedAt = RECEIVED): MessageInput {
  const m: MessageInput = { text, source: 'paste', receivedAt, region: 'CM' };
  if (sender) m.sender = sender;
  return m;
}
