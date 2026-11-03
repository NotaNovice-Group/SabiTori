import { PHRASE_KEYS, type LanguagePack, type RegionConfig } from '@sabitori/core';
import { numberClipIds } from './numbers.js';

/**
 * Every clip id a fully recorded pack needs, sorted and unique. TTS packs
 * need none. Optional clips (pause.short) are not listed.
 */
export function requiredClips(pack: LanguagePack, opts?: { region?: RegionConfig }): string[] {
  if (pack.manifest.voice.kind !== 'recorded') return [];
  const out = new Set<string>();
  const { rules } = pack;

  for (const key of PHRASE_KEYS) {
    for (const a of pack.phrases[key]?.audio ?? []) if ('clip' in a) out.add(a.clip);
  }

  for (const id of numberClipIds(rules.numbers)) out.add(id);

  for (const w of Object.keys(rules.words ?? {})) out.add(`word.${w}`);
  for (const [c, w] of Object.entries(rules.money?.currencies ?? {})) {
    out.add(`currency.${c}`);
    const x = w as { plural?: string; pluralClip?: boolean };
    if (x.pluralClip && x.plural !== undefined) out.add(`currency.${c}.plural`);
  }
  const d = rules.dates;
  if (d) {
    d.months.forEach((_, i) => out.add(`month.${i + 1}`));
    d.weekdays?.forEach((_, i) => out.add(`weekday.${i + 1}`));
    for (const k of Object.keys(d.days ?? {})) out.add(`day.${Number(k)}`);
    for (const k of Object.keys(d.relative ?? {})) out.add(`rel.${k}`);
  }
  for (const s of opts?.region?.officialSenders ?? []) out.add(`sender.${s.id}`);
  return [...out].sort();
}
