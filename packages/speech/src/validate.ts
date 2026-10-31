import { CATALOG, type LanguagePack, type PackManifest, type PackPhrases, type PackRules } from '@sabitori/core';
import { PackLoadError } from './errors.js';
import { maxNumber, numberTokens } from './numbers.js';
import { parseTemplate } from './tokens.js';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isBool = (v: unknown): boolean => typeof v === 'boolean';
const MAX_TEXT = 500;
/** Ids that become clip names ("word.<key>", "currency.<code>", "join.<key>") or URL parts. */
const ID = /^[A-Za-z0-9_.-]+$/;
const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && !v.includes('..');
const TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
export const isLangTag = (v: unknown): v is string => typeof v === 'string' && v.length <= 35 && TAG.test(v);
const keysOf = (o: Record<string, unknown>): string[] => Object.keys(o);

export function validateManifest(m: unknown, tag?: string): PackManifest {
  const p: string[] = [];
  if (!isObj(m)) throw new PackLoadError(`manifest.json for "${tag}" must be a JSON object`, tag);
  if (m.formatVersion !== 1) p.push('formatVersion must be 1');
  if (!isLangTag(m.tag)) p.push('tag must be a language tag such as "fr" or "pcm-CM" (letters and digits only)');
  else if (tag && m.tag !== tag) p.push(`tag "${m.tag}" does not match folder "${tag}"`);
  if (typeof m.name !== 'string') p.push('name must be a string');
  if (typeof m.autonym !== 'string') p.push('autonym must be a string');
  if (!Array.isArray(m.fallback) || m.fallback.some((x) => !isLangTag(x))) p.push('fallback must be an array of valid language tags');
  else {
    if (m.fallback.includes(m.tag) || (tag !== undefined && m.fallback.includes(tag))) p.push('fallback must not list the pack itself');
    if (new Set(m.fallback).size !== m.fallback.length) p.push('fallback lists a language twice');
  }
  if (m.direction !== undefined && m.direction !== 'ltr' && m.direction !== 'rtl') p.push('direction must be "ltr" or "rtl"');
  if (m.status !== undefined && !['stable', 'beta', 'in_recording', 'planned'].includes(m.status as string)) {
    p.push('status must be one of stable, beta, in_recording, planned');
  }
  if (m.reads !== undefined && !isBool(m.reads)) p.push('reads must be true or false');
  if (m.script !== undefined && typeof m.script !== 'string') p.push('script must be a string');
  if (m.regions !== undefined && (!Array.isArray(m.regions) || m.regions.some((x) => typeof x !== 'string'))) p.push('regions must be an array of region codes');
  if (!isObj(m.voice)) p.push('voice must be an object');
  else if (m.voice.kind === 'tts') {
    if (typeof m.voice.bcp47 !== 'string' || !m.voice.bcp47) p.push('voice.bcp47 is required when voice.kind is "tts"');
    if (m.voice.engine !== undefined && m.voice.engine !== 'system' && m.voice.engine !== 'piper') p.push('voice.engine must be "system" or "piper"');
    if (m.voice.voiceHint !== undefined && typeof m.voice.voiceHint !== 'string') p.push('voice.voiceHint must be a string');
  } else if (m.voice.kind !== 'recorded') p.push('voice.kind must be "tts" or "recorded"');
  if (p.length) throw new PackLoadError(`Invalid manifest.json for "${tag ?? (isObj(m) ? String(m.tag) : '?')}": ${p.join('; ')}`, tag);
  return m as unknown as PackManifest;
}

export function validatePhrases(ph: unknown, tag?: string): PackPhrases {
  const p: string[] = [];
  if (!isObj(ph)) throw new PackLoadError(`phrases.json for "${tag}" must be a JSON object`, tag);
  for (const [key, e] of Object.entries(ph)) {
    if (!has(CATALOG, key)) {
      p.push(`unknown phrase key "${key}"`);
      continue;
    }
    if (!isObj(e) || typeof e.text !== 'string') {
      p.push(`${key}: text must be a string`);
      continue;
    }
    if (e.status !== undefined && e.status !== 'draft' && e.status !== 'reviewed') p.push(`${key}: status must be "draft" or "reviewed"`);
    if (e.audio !== undefined) {
      const declared = (CATALOG as Record<string, { slots?: readonly string[] }>)[key]!.slots ?? [];
      if (!Array.isArray(e.audio)) p.push(`${key}: audio must be an array`);
      else
        e.audio.forEach((a, i) => {
          const where = `${key}: audio[${i}]`;
          if (!isObj(a)) return void p.push(`${where} must be {clip} or {slot}`);
          const ks = keysOf(a);
          if (ks.length !== 1 || (ks[0] !== 'clip' && ks[0] !== 'slot')) return void p.push(`${where} must be exactly {clip} or {slot}`);
          if (ks[0] === 'clip') {
            if (!isId(a.clip)) p.push(`${where}.clip must be a clip id (letters, digits, "_", ".", "-"; no "..")`);
          } else if (typeof a.slot !== 'string' || !declared.includes(a.slot)) {
            p.push(`${where}.slot ${JSON.stringify(a.slot)} is not a slot of ${key} (${declared.join(', ') || 'none'})`);
          }
        });
    }
  }
  if (p.length) throw new PackLoadError(`Invalid phrases.json for "${tag}": ${p.join('; ')}`, tag);
  return ph as PackPhrases;
}

/** Collects problems for validateRules. */
function checkNumbers(num: unknown, p: string[]): void {
  if (!isObj(num) || !isObj(num.atoms)) return void p.push('numbers.atoms is required');
  const atoms = num.atoms;
  for (let d = 0; d <= 9; d++) if (!has(atoms, String(d))) p.push(`numbers.atoms is missing "${d}" (0-9 are required)`);
  for (const [k, w] of Object.entries(atoms)) {
    if (!/^(0|[1-9]\d{0,14})$/.test(k)) p.push(`numbers.atoms key "${k}" must be a whole number`);
    if (isStr(w) && w.length <= MAX_TEXT) continue;
    if (isObj(w) && isStr(w.text) && (w.bound === undefined || isStr(w.bound))) continue;
    p.push(`numbers.atoms["${k}"] must be a non-empty string or {"text": string, "bound"?: string}`);
  }

  let joiners: Record<string, unknown> = {};
  if (num.joiners !== undefined) {
    if (!isObj(num.joiners)) p.push('numbers.joiners must be an object');
    else {
      joiners = num.joiners;
      for (const [k, j] of Object.entries(joiners)) {
        if (!isId(k)) p.push(`numbers.joiners key "${k}" is not a valid id`);
        if (!isObj(j) || !isStr(j.text) || (j.silent !== undefined && !isBool(j.silent))) {
          p.push(`numbers.joiners["${k}"] must be {"text": non-empty string, "silent"?: boolean}`);
        }
      }
    }
  }
  const checkWhen = (where: string, w: unknown): void => {
    if (w === undefined) return;
    if (!isObj(w)) return void p.push(`${where}.when must be an object`);
    if (w.remainderEq !== undefined && (!Array.isArray(w.remainderEq) || w.remainderEq.some((x) => !isInt(x, 0)))) p.push(`${where}.when.remainderEq must be an array of integers`);
    for (const f of ['remainderLt', 'remainderGte'] as const) if (w[f] !== undefined && !isInt(w[f], 0)) p.push(`${where}.when.${f} must be an integer`);
  };
  const checkJoin = (where: string, js: unknown): void => {
    if (js === undefined) return;
    if (!Array.isArray(js)) return void p.push(`${where} must be an array`);
    js.forEach((j, i) => {
      if (!isObj(j) || typeof j.token !== 'string' || !has(joiners, j.token)) p.push(`${where}[${i}]: unknown joiner ${JSON.stringify(isObj(j) ? j.token : j)}`);
      else checkWhen(`${where}[${i}]`, j.when);
    });
  };
  checkJoin('numbers.join', num.join);

  const scaleValues = new Set<number>();
  if (num.scales !== undefined) {
    if (!Array.isArray(num.scales)) p.push('numbers.scales must be an array');
    else
      num.scales.forEach((s, i) => {
        const w = `numbers.scales[${i}]`;
        if (!isObj(s)) return void p.push(`${w} must be an object`);
        if (!isInt(s.value, 2) || s.value > Number.MAX_SAFE_INTEGER / 1000) p.push(`${w}.value must be a whole number of at least 2`);
        else if (scaleValues.has(s.value)) p.push(`${w}.value ${s.value} is repeated`);
        else scaleValues.add(s.value);
        if (!isStr(s.word)) p.push(`${w}.word must be a non-empty string`);
        if (s.plural !== undefined && !isStr(s.plural)) p.push(`${w}.plural must be a non-empty string`);
        if (s.pluralWhen !== undefined && !['never', 'multiple', 'multiple_final'].includes(s.pluralWhen as string)) p.push(`${w}.pluralWhen is not valid`);
        if (s.order !== undefined && s.order !== 'multiplier_first' && s.order !== 'scale_first') p.push(`${w}.order is not valid`);
        for (const f of ['omitOne', 'multiplierFinal']) if (s[f] !== undefined && !isBool(s[f])) p.push(`${w}.${f} must be true or false`);
        checkJoin(`${w}.join`, s.join);
      });
  }

  if (num.overrides !== undefined) {
    if (!isObj(num.overrides)) return void p.push('numbers.overrides must be an object');
    for (const [k, o] of Object.entries(num.overrides)) {
      const w = `numbers.overrides["${k}"]`;
      const m = /^(\d{1,15})(?:-(\d{1,15}))?$/.exec(k);
      if (!m) p.push(`numbers.overrides key "${k}" must be "n" or "lo-hi"`);
      else if (m[2] !== undefined && Number(m[1]) > Number(m[2])) p.push(`${w}: range start is above its end`);
      if (!isObj(o) || (o.say === undefined && o.base === undefined)) {
        p.push(`${w} needs say or base`);
        continue;
      }
      const lo = m ? Number(m[1]) : 0;
      if (o.base !== undefined) {
        if (!isInt(o.base, 1)) p.push(`${w}.base must be a whole number of at least 1`);
        else if (m && o.base >= lo) p.push(`${w}.base ${o.base} must be below ${lo}`);
        checkJoin(`${w}.join`, o.join);
      }
      if (o.say !== undefined) {
        if (!Array.isArray(o.say) || o.say.length === 0) p.push(`${w}.say must be a non-empty array`);
        else
          o.say.forEach((it, i) => {
            const iw = `${w}.say[${i}]`;
            const ks = isObj(it) ? keysOf(it) : [];
            if (!isObj(it) || ks.length !== 1) return void p.push(`${iw} must have exactly one of atom, scale, join, number`);
            const v = it[ks[0]!];
            if (ks[0] === 'atom') {
              if (!isInt(v, 0) || !has(atoms, String(v))) p.push(`${iw}.atom ${JSON.stringify(v)} is not in numbers.atoms`);
            } else if (ks[0] === 'scale') {
              if (!isInt(v, 2) || !scaleValues.has(v)) p.push(`${iw}.scale ${JSON.stringify(v)} is not in numbers.scales`);
            } else if (ks[0] === 'join') {
              if (typeof v !== 'string' || !has(joiners, v)) p.push(`${iw}.join ${JSON.stringify(v)} is not in numbers.joiners`);
            } else if (ks[0] === 'number') {
              if (!isInt(v, 0)) p.push(`${iw}.number must be a non-negative integer`);
            } else p.push(`${iw} has unknown key "${ks[0]}"`);
          });
      }
    }
  }
}

export function validateRules(r: unknown, tag?: string): PackRules {
  const p: string[] = [];
  if (!isObj(r)) throw new PackLoadError(`rules.json for "${tag}" must be a JSON object`, tag);
  if (r.formatVersion !== 1) p.push('formatVersion must be 1');

  let words: Record<string, unknown> = {};
  if (r.words !== undefined) {
    if (!isObj(r.words)) p.push('words must be an object');
    else {
      words = r.words;
      for (const [k, w] of Object.entries(words)) {
        if (!isId(k)) p.push(`words key "${k}" is not a valid id`);
        if (!isStr(w) || w.length > MAX_TEXT) p.push(`words["${k}"] must be a non-empty string`);
      }
    }
  }
  checkNumbers(r.numbers, p);

  /** Checks a template and returns the slot names it uses. */
  const tpl = (where: string, t: unknown, slots: string[], required: string[]): void => {
    if (typeof t !== 'string') return void p.push(`${where} must be a string`);
    try {
      const used = new Set<string>();
      for (const part of parseTemplate(t)) {
        if (part.kind === 'slot') {
          used.add(part.name);
          if (!slots.includes(part.name)) p.push(`${where}: unknown slot {${part.name}}`);
        }
        if (part.kind === 'word' && !has(words, part.key)) p.push(`${where}: {w:${part.key}} is not in words`);
      }
      for (const s of required) if (!used.has(s)) p.push(`${where} must contain {${s}} (otherwise the spoken text drops it)`);
    } catch (e) {
      p.push(`${where}: ${(e as Error).message}`);
    }
  };

  if (r.money !== undefined) {
    const m = r.money;
    if (!isObj(m)) p.push('money must be an object');
    else {
      if (!isObj(m.currencies)) p.push('money.currencies is required');
      else
        for (const [c, w] of Object.entries(m.currencies)) {
          if (!isId(c)) p.push(`money.currencies key "${c}" is not a valid code`);
          if (!isObj(w) || !isStr(w.text) || (w.plural !== undefined && !isStr(w.plural))) {
            p.push(`money.currencies["${c}"] must be {"text": non-empty string, "plural"?: non-empty string}`);
          }
        }
      tpl('money.template', m.template, ['amount', 'currency', 'link'], ['amount', 'currency']);
      if (m.singularFor !== undefined && (!Array.isArray(m.singularFor) || m.singularFor.some((x) => !isInt(x, 0)))) p.push('money.singularFor must be an array of whole numbers');
      if (m.link !== undefined) {
        const l = m.link;
        if (!isObj(l) || typeof l.word !== 'string' || !has(words, l.word)) p.push('money.link.word must be a key of words');
        if (!isObj(l) || !isInt(l.multipleOf, 1)) p.push('money.link.multipleOf must be a whole number of at least 1');
      }
    }
  }

  if (r.dates !== undefined) {
    const d = r.dates;
    if (!isObj(d)) p.push('dates must be an object');
    else {
      if (!Array.isArray(d.months) || d.months.length !== 12 || d.months.some((x) => !isStr(x))) p.push('dates.months must be exactly 12 non-empty strings');
      if (d.weekdays !== undefined && (!Array.isArray(d.weekdays) || d.weekdays.length !== 7 || d.weekdays.some((x) => !isStr(x)))) {
        p.push('dates.weekdays must be exactly 7 non-empty strings, Monday first');
      }
      if (d.days !== undefined) {
        if (!isObj(d.days)) p.push('dates.days must be an object');
        else
          for (const [k, w] of Object.entries(d.days)) {
            if (!/^([1-9]|[12]\d|3[01])$/.test(k)) p.push(`dates.days key "${k}" must be 1..31`);
            if (!isStr(w)) p.push(`dates.days["${k}"] must be a non-empty string`);
          }
      }
      if (!isObj(d.templates)) p.push('dates.templates is required');
      else {
        for (const k of ['full', 'noYear']) if (d.templates[k] === undefined) p.push(`dates.templates.${k} is required`);
        for (const [k, t] of Object.entries(d.templates)) {
          if (!['full', 'noYear', 'fullWeekday', 'noYearWeekday'].includes(k)) p.push(`dates.templates.${k} is not a known template`);
          else tpl(`dates.templates.${k}`, t, ['day', 'month', 'year', 'weekday'], ['day', 'month']);
        }
      }
      for (const f of ['omitCurrentYear', 'includeWeekday']) if (d[f] !== undefined && !isBool(d[f])) p.push(`dates.${f} must be true or false`);
      if (d.yearStyle !== undefined && d.yearStyle !== 'cardinal' && d.yearStyle !== 'century_pairs') p.push('dates.yearStyle must be "cardinal" or "century_pairs"');
      if (d.relative !== undefined) {
        if (!isObj(d.relative)) p.push('dates.relative must be an object');
        else
          for (const [k, w] of Object.entries(d.relative)) {
            if (!['today', 'tomorrow', 'yesterday'].includes(k)) p.push(`dates.relative.${k} is not today, tomorrow or yesterday`);
            if (!isStr(w)) p.push(`dates.relative.${k} must be a non-empty string`);
          }
      }
    }
  }

  if (r.phones !== undefined) {
    const ph = r.phones;
    const sizes = (where: string, g: unknown): void => {
      if (!Array.isArray(g) || g.length > 32 || g.some((x) => !isInt(x, 1) || x > 20)) p.push(`${where} must be an array of whole numbers from 1 to 20`);
    };
    if (!isObj(ph)) p.push('phones must be an object');
    else {
      sizes('phones.groups', ph.groups);
      if (ph.read !== 'number' && ph.read !== 'digits') p.push('phones.read must be "number" or "digits"');
      if (ph.defaultGroupSize !== undefined && (!isInt(ph.defaultGroupSize, 1) || ph.defaultGroupSize > 20)) p.push('phones.defaultGroupSize must be a whole number of at least 1');
      if (ph.groupsByLength !== undefined) {
        if (!isObj(ph.groupsByLength)) p.push('phones.groupsByLength must be an object');
        else
          for (const [k, g] of Object.entries(ph.groupsByLength)) {
            if (!/^[1-9]\d{0,1}$/.test(k)) p.push(`phones.groupsByLength key "${k}" must be a digit count`);
            sizes(`phones.groupsByLength["${k}"]`, g);
          }
      }
      if (ph.groupRead !== undefined && (!Array.isArray(ph.groupRead) || ph.groupRead.some((x) => x !== 'number' && x !== 'digits'))) p.push('phones.groupRead must be an array of "number" or "digits"');
      if (ph.countryCode !== undefined && ph.countryCode !== 'omit' && ph.countryCode !== 'say') p.push('phones.countryCode must be "omit" or "say"');
      if (ph.pause !== undefined && (!isObj(ph.pause) || typeof ph.pause.text !== 'string')) p.push('phones.pause must be {"text": string}');
    }
  }

  if (p.length) throw new PackLoadError(`Invalid rules.json for "${tag}": ${p.join('; ')}`, tag);

  // Structure is sound. Probe the number rules so cycles and holes surface now, not in front of a user.
  const rules = r as unknown as PackRules;
  const q: string[] = [];
  const ov = Object.keys(rules.numbers.overrides ?? {}).flatMap((k) => k.split('-').map(Number));
  for (const n of ov) {
    try {
      numberTokens(rules.numbers, n);
    } catch (e) {
      q.push(`numbers.overrides: cannot say ${n} (${(e as Error).message})`);
    }
  }
  if (q.length) throw new PackLoadError(`Invalid rules.json for "${tag}": ${q.join('; ')}`, tag);
  return rules;
}

/**
 * Non-fatal problems in rules that are structurally valid: numbers that the
 * rules cannot say (they fall back to another language) and atoms that stop
 * below 10 with nothing to build larger numbers from.
 */
export function rulesWarnings(rules: PackRules): string[] {
  const out: string[] = [];
  const n = rules.numbers;
  const top = Math.max(...Object.keys(n.atoms).map(Number));
  if (!n.scales || n.scales.length === 0) {
    if (top < 10) {
      out.push(`numbers: atoms stop at ${top} and there are no scales: numbers above ${top} are read digit by digit (add atoms or scales)`);
    } else out.push(`numbers: no scales, so numbers above ${maxNumber(n)} are read digit by digit`);
  }
  const bad: number[] = [];
  const limit = Math.min(maxNumber(n), 1999);
  for (let i = 0; i <= limit && bad.length < 5; i++) {
    try {
      numberTokens(n, i);
    } catch {
      bad.push(i);
    }
  }
  if (bad.length) out.push(`numbers: cannot say ${bad.join(', ')}${bad.length === 5 ? ' ...' : ''}: those numbers fall back to another language`);
  return out;
}

export function validatePack(pack: LanguagePack): void {
  validateManifest(pack.manifest, pack.manifest?.tag);
  validatePhrases(pack.phrases, pack.manifest.tag);
  validateRules(pack.rules, pack.manifest.tag);
}
