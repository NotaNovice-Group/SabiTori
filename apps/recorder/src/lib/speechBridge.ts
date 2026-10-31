/**
 * The only file that talks to @sabitori/speech. Everything here has a plain
 * fallback so the recorder keeps working if the package cannot answer.
 */
import type { LanguagePack, SlotValue, PhraseKey } from '@sabitori/core';
import * as speech from '@sabitori/speech';

export function requiredAtomIds(pack: LanguagePack): string[] {
  try {
    return [...speech.requiredClips(pack)];
  } catch {
    return [];
  }
}

/** Example values so a reviewer hears slots filled in. */
export const EXAMPLE_SLOTS: Record<string, { value: SlotValue; shown: string }> = {
  sender: { value: { type: 'sender', fallbackText: 'MTN MoMo' }, shown: 'MTN MoMo' },
  date: { value: { type: 'date', value: '2026-11-14', relativeTo: '2026-11-10' }, shown: '14 November 2026' },
  amount: { value: { type: 'money', value: { amount: 15000, currency: 'XAF' } }, shown: '15 000 FCFA' },
  phone: { value: { type: 'phone', value: '+237677123456' }, shown: '6 77 12 34 56' },
};

export type Playable = { kind: 'clip'; url: string } | { kind: 'tts'; text: string };

/**
 * Render a phrase with example slot values through the real speech package.
 * Returns null when it cannot (rules incomplete, atoms not recorded yet).
 */
export async function renderWithSlots(
  key: PhraseKey,
  pack: LanguagePack,
  clipUrl: (id: string) => string,
  hasClip: (id: string) => boolean,
  slots: string[],
): Promise<{ text: string; parts: Playable[] } | null> {
  try {
    const registry = speech.createMemoryRegistry([{ ...pack, clipUrl, hasClip } as speech.SpeechPack]);
    const values: Record<string, SlotValue> = {};
    for (const s of slots) if (EXAMPLE_SLOTS[s]) values[s] = EXAMPLE_SLOTS[s]!.value;
    const region = {
      formatVersion: 1 as const, code: 'CM', name: 'Cameroon', timezone: 'Africa/Douala',
      currency: { code: 'XAF', aliases: ['FCFA'] }, phone: { countryCode: '237', nationalPattern: '[62]\\d{8}' },
      languages: [pack.manifest.tag], officialSenders: [],
    };
    const out = await speech.renderPhrase(key, values, pack.manifest.tag, registry, { region, today: '2026-11-10' });
    return { text: out.text, parts: out.parts as Playable[] };
  } catch {
    return null;
  }
}
