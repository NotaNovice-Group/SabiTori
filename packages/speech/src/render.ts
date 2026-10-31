import {
  CATALOG,
  type CardSection,
  type IsoDate,
  type LangTag,
  type LanguagePack,
  type PhraseKey,
  type RegionConfig,
  type SlotValue,
  type SpeechPlan,
} from '@sabitori/core';
import { dateTokens } from './dates.js';
import { MissingResourceError, SpeechRuleError } from './errors.js';
import { moneyTokens } from './money.js';
import { numberTokens } from './numbers.js';
import { phoneTokens } from './phones.js';
import type { PackRegistry, SpeechPack } from './registry.js';
import { assemble, type Token } from './tokens.js';

export type RenderedPart = { kind: 'tts'; text: string; bcp47: string } | { kind: 'clip'; url: string };

export interface RenderedSection {
  section: CardSection;
  text: string;
  parts: RenderedPart[];
  /** Language actually spoken. Differs from the requested one when a phrase fell back. */
  lang: LangTag;
}

export interface RenderContext {
  region: RegionConfig;
  today: IsoDate;
}

type Piece = { kind: 'tts'; text: string; bcp47: string } | { kind: 'clip'; id: string };
type Slots = Record<string, SlotValue> | undefined;

interface Env {
  pack: SpeechPack;
  chain: SpeechPack[];
  registry: PackRegistry;
  ctx: RenderContext;
}

const ttsOf = (p: LanguagePack): string | undefined => (p.manifest.voice.kind === 'tts' ? p.manifest.voice.bcp47 : undefined);
const hasClip = (p: SpeechPack, id: string): boolean => (p.hasClip ? p.hasClip(id) : true);
const clipUrl = (p: LanguagePack, id: string): string => p.clipUrl?.(id) ?? `${p.manifest.tag}/audio/${id}.webm`;

async function resolveChain(tag: LangTag, registry: PackRegistry): Promise<SpeechPack[]> {
  const first = await registry.get(tag);
  const out: SpeechPack[] = [first];
  const seen = new Set<string>([tag]);
  const visit = async (p: LanguagePack): Promise<void> => {
    for (const fb of p.manifest.fallback ?? []) {
      if (seen.has(fb)) continue;
      seen.add(fb);
      try {
        const q = await registry.get(fb);
        out.push(q);
        await visit(q);
      } catch {
        /* a fallback that cannot load is skipped */
      }
    }
  };
  await visit(first);
  if (!seen.has('en')) {
    try {
      out.push(await registry.get('en'));
    } catch {
      /* no English pack */
    }
  }
  return out;
}

function slotTokens(slot: SlotValue, env: Env): Token[] | null {
  const { rules } = env.pack;
  switch (slot.type) {
    case 'number':
      return numberTokens(rules.numbers, slot.value);
    case 'money':
      return moneyTokens(rules, slot.value);
    case 'date':
      return dateTokens(rules, slot.value, slot.relativeTo ?? env.ctx.today);
    case 'phone':
      return phoneTokens(rules, slot.value, env.ctx.region.phone.countryCode);
    default:
      return null;
  }
}

async function bcp47For(lang: string, env: Env): Promise<string> {
  const own = ttsOf(env.pack) ?? env.chain.map(ttsOf).find(Boolean);
  if (lang === 'unknown') return own ?? 'en';
  try {
    const p = await env.registry.get(lang);
    return ttsOf(p) ?? lang;
  } catch {
    return lang;
  }
}

async function slotResult(slot: SlotValue, env: Env): Promise<{ display: string; pieces: Piece[] }> {
  const recorded = env.pack.manifest.voice.kind === 'recorded';
  const tokens = slotTokens(slot, env);
  if (tokens) {
    const display = assemble(tokens);
    if (!recorded) return { display, pieces: [{ kind: 'tts', text: display, bcp47: ttsOf(env.pack)! }] };
    const pieces: Piece[] = [];
    for (const t of tokens) {
      if (t.id === null) continue;
      if (!hasClip(env.pack, t.id)) {
        if (t.optional) continue;
        throw new MissingResourceError(`clip ${t.id} missing in ${env.pack.manifest.tag}`);
      }
      pieces.push({ kind: 'clip', id: t.id });
    }
    return { display, pieces };
  }
  if (slot.type === 'text') {
    return { display: slot.value, pieces: [{ kind: 'tts', text: slot.value, bcp47: await bcp47For(slot.lang, env) }] };
  }
  if (slot.type === 'sender') {
    const name =
      env.ctx.region.officialSenders.find((s) => s.id === slot.officialId)?.displayName ?? slot.fallbackText ?? '';
    if (!name) return { display: '', pieces: [] };
    if (recorded && slot.officialId && hasClip(env.pack, `sender.${slot.officialId}`)) {
      return { display: name, pieces: [{ kind: 'clip', id: `sender.${slot.officialId}` }] };
    }
    const bcp47 = ttsOf(env.pack) ?? env.chain.map(ttsOf).find(Boolean);
    if (!bcp47) throw new MissingResourceError(`no voice to say sender name in ${env.pack.manifest.tag}`);
    return { display: name, pieces: [{ kind: 'tts', text: name, bcp47 }] };
  }
  throw new SpeechRuleError('unsupported slot');
}

async function getSlot(name: string, slots: Slots, env: Env) {
  const s = slots?.[name];
  if (!s) throw new MissingResourceError(`slot "${name}" not provided`);
  return slotResult(s, env);
}

function finish(pieces: Piece[], text: string, pack: LanguagePack): { text: string; parts: RenderedPart[] } {
  const merged: Piece[] = [];
  for (const p of pieces) {
    const last = merged.at(-1);
    if (p.kind === 'tts' && last?.kind === 'tts' && last.bcp47 === p.bcp47) last.text += p.text;
    else merged.push({ ...p });
  }
  const parts: RenderedPart[] = [];
  for (const p of merged) {
    if (p.kind === 'clip') parts.push({ kind: 'clip', url: clipUrl(pack, p.id) });
    else if (p.text.trim()) parts.push({ kind: 'tts', text: p.text.trim().replace(/\s+/g, ' '), bcp47: p.bcp47 });
  }
  return { text: text.replace(/\s+/g, ' ').trim(), parts };
}

/** Fill "{slot}" placeholders of `template`, speaking everything with the pack's own voice. */
async function renderTts(template: string, slots: Slots, env: Env, bcp47: string): Promise<{ text: string; parts: RenderedPart[] }> {
  const pieces: Piece[] = [];
  let text = '';
  const re = /\{(\w+)\}/g;
  let last = 0;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    const lit = template.slice(last, m.index);
    pieces.push({ kind: 'tts', text: lit, bcp47 });
    text += lit;
    const r = await getSlot(m[1]!, slots, env);
    pieces.push(...r.pieces);
    text += r.display;
    last = m.index + m[0].length;
  }
  const tail = template.slice(last);
  pieces.push({ kind: 'tts', text: tail, bcp47 });
  text += tail;
  return finish(pieces, text, env.pack);
}

async function renderRecorded(key: PhraseKey, slots: Slots, env: Env): Promise<{ text: string; parts: RenderedPart[] }> {
  const entry = env.pack.phrases[key]!;
  if (!entry.audio || entry.audio.length === 0) throw new MissingResourceError(`${key} has no audio in ${env.pack.manifest.tag}`);
  const pieces: Piece[] = [];
  for (const a of entry.audio) {
    if ('clip' in a) {
      if (!hasClip(env.pack, a.clip)) throw new MissingResourceError(`clip ${a.clip} missing in ${env.pack.manifest.tag}`);
      pieces.push({ kind: 'clip', id: a.clip });
    } else pieces.push(...(await getSlot(a.slot, slots, env)).pieces);
  }
  let text = entry.text;
  for (const m of entry.text.matchAll(/\{(\w+)\}/g)) {
    const s = slots?.[m[1]!];
    if (s) text = text.replace(m[0], (await slotResult(s, env).catch(() => ({ display: '' }))).display);
  }
  return finish(pieces, text, env.pack);
}

async function renderInChain(key: PhraseKey, slots: Slots, chain: SpeechPack[], registry: PackRegistry, ctx: RenderContext) {
  for (const pack of chain) {
    const entry = pack.phrases[key];
    if (!entry) continue;
    const env: Env = { pack, chain, registry, ctx };
    try {
      const v = pack.manifest.voice;
      const r = v.kind === 'tts' ? await renderTts(entry.text, slots, env, v.bcp47) : await renderRecorded(key, slots, env);
      return { ...r, lang: pack.manifest.tag };
    } catch (e) {
      if (e instanceof MissingResourceError || e instanceof SpeechRuleError) continue;
      throw e;
    }
  }
  // Last resort: the catalog's English source text, spoken with English rules if we have them.
  const en = chain.find((p) => p.manifest.tag === 'en');
  if (en) {
    const env: Env = { pack: en, chain, registry, ctx };
    const bcp47 = ttsOf(en);
    if (bcp47) {
      try {
        return { ...(await renderTts(CATALOG[key].en, slots, env, bcp47)), lang: 'en' };
      } catch (e) {
        if (!(e instanceof MissingResourceError || e instanceof SpeechRuleError)) throw e;
      }
    }
  }
  throw new MissingResourceError(`Cannot render "${key}" in ${chain[0]?.manifest.tag} or any fallback`);
}

export async function renderPhrase(
  key: PhraseKey,
  slots: Record<string, SlotValue> | undefined,
  tag: LangTag,
  registry: PackRegistry,
  ctx: RenderContext,
): Promise<{ text: string; parts: RenderedPart[]; lang: LangTag }> {
  return renderInChain(key, slots, await resolveChain(tag, registry), registry, ctx);
}

export async function renderPlan(plan: SpeechPlan, tag: LangTag, registry: PackRegistry, ctx: RenderContext): Promise<RenderedSection[]> {
  const chain = await resolveChain(tag, registry);
  const out: RenderedSection[] = [];
  for (const s of plan.sections) {
    const texts: string[] = [];
    const parts: RenderedPart[] = [];
    let lang: LangTag = tag;
    let fellBack = false;
    for (const u of s.utterances) {
      const r = await renderInChain(u.key, u.slots, chain, registry, ctx);
      if (r.text) texts.push(r.text);
      parts.push(...r.parts);
      if (!fellBack && r.lang !== tag) {
        lang = r.lang;
        fellBack = true;
      }
    }
    out.push({ section: s.section, text: texts.join(' '), parts, lang });
  }
  return out;
}
