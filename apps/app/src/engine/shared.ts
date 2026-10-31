import type { LangTag, PackManifest } from '@sabitori/core';
import { PHRASE_KEYS } from '@sabitori/core';
import { EXTRA, EXTRA_KEYS, isExtraKey } from './extra';
import type { Bundle, UiKey } from './types';

/** Replace {name} slots in an interface string with plain text. */
export function fillSlots(text: string, slots?: Record<string, string>): string {
  if (!slots) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
}

/**
 * Resolve an app-local (extra) string for a language: the pack's own entry if it
 * has one, then the pack fallback chain, then fr, then en.
 */
export function resolveExtra(
  key: keyof typeof EXTRA,
  lang: LangTag,
  chain: LangTag[],
  packPhrase?: (tag: LangTag) => string | undefined,
): { text: string; lang: LangTag } {
  const entry = EXTRA[key];
  for (const tag of [lang, ...chain]) {
    const own = packPhrase?.(tag);
    if (own) return { text: own, lang: tag };
    if (tag === 'en' || tag === 'fr') return { text: entry[tag], lang: tag };
  }
  return { text: entry.fr, lang: 'fr' };
}

export function fallbackChain(manifests: Map<LangTag, PackManifest>, lang: LangTag): LangTag[] {
  const out: LangTag[] = [];
  const seen = new Set<LangTag>([lang]);
  const walk = (tag: LangTag) => {
    for (const f of manifests.get(tag)?.fallback ?? []) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
        walk(f);
      }
    }
  };
  walk(lang);
  for (const f of ['fr', 'en']) if (!seen.has(f)) out.push(f);
  return out;
}

export const BUNDLE_KEYS: UiKey[] = [...PHRASE_KEYS, ...EXTRA_KEYS];
export { isExtraKey };
export type { Bundle };
