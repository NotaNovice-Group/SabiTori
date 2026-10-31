import { PHRASE_KEYS, type JoinChoice, type LanguagePack, type RegionConfig } from '@sabitori/core';
import { maxNumber } from './numbers.js';

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

  const n = rules.numbers;
  for (const k of Object.keys(n.atoms)) out.add(`num.${Number(k)}`);
  for (const s of n.scales ?? []) {
    if (s.value <= maxNumber(n)) out.add(`scale.${s.value}`);
  }
  const joins = (js?: JoinChoice[]): void => {
    for (const j of js ?? []) if (!n.joiners?.[j.token]?.silent) out.add(`join.${j.token}`);
  };
  joins(n.join);
  for (const s of n.scales ?? []) joins(s.join);
  for (const o of Object.values(n.overrides ?? {})) {
    joins(o.join);
    for (const it of o.say ?? []) if ('join' in it && !n.joiners?.[it.join]?.silent) out.add(`join.${it.join}`);
  }

  for (const w of Object.keys(rules.words ?? {})) out.add(`word.${w}`);
  for (const c of Object.keys(rules.money?.currencies ?? {})) out.add(`currency.${c}`);
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
