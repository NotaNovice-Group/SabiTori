import { CATALOG, type LanguagePack, type PackManifest, type PackPhrases, type PackRules } from '@sabitori/core';
import { PackLoadError } from './errors.js';
import { parseTemplate } from './tokens.js';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateManifest(m: unknown, tag?: string): PackManifest {
  const p: string[] = [];
  if (!isObj(m)) throw new PackLoadError(`manifest.json for "${tag}" must be a JSON object`, tag);
  if (m.formatVersion !== 1) p.push('formatVersion must be 1');
  if (typeof m.tag !== 'string' || !m.tag) p.push('tag must be a non-empty string');
  else if (tag && m.tag !== tag) p.push(`tag "${m.tag}" does not match folder "${tag}"`);
  if (typeof m.name !== 'string') p.push('name must be a string');
  if (typeof m.autonym !== 'string') p.push('autonym must be a string');
  if (!Array.isArray(m.fallback) || m.fallback.some((x) => typeof x !== 'string')) p.push('fallback must be an array of language tags');
  if (!isObj(m.voice)) p.push('voice must be an object');
  else if (m.voice.kind === 'tts') {
    if (typeof m.voice.bcp47 !== 'string' || !m.voice.bcp47) p.push('voice.bcp47 is required when voice.kind is "tts"');
  } else if (m.voice.kind !== 'recorded') p.push('voice.kind must be "tts" or "recorded"');
  if (p.length) throw new PackLoadError(`Invalid manifest.json for "${tag ?? m.tag}": ${p.join('; ')}`, tag);
  return m as unknown as PackManifest;
}

export function validatePhrases(ph: unknown, tag?: string): PackPhrases {
  const p: string[] = [];
  if (!isObj(ph)) throw new PackLoadError(`phrases.json for "${tag}" must be a JSON object`, tag);
  for (const [key, e] of Object.entries(ph)) {
    if (!(key in CATALOG)) {
      p.push(`unknown phrase key "${key}"`);
      continue;
    }
    if (!isObj(e) || typeof e.text !== 'string') {
      p.push(`${key}: text must be a string`);
      continue;
    }
    if (e.audio !== undefined) {
      if (!Array.isArray(e.audio)) p.push(`${key}: audio must be an array`);
      else
        e.audio.forEach((a, i) => {
          if (!isObj(a) || (typeof a.clip !== 'string' && typeof a.slot !== 'string')) p.push(`${key}: audio[${i}] must be {clip} or {slot}`);
        });
    }
  }
  if (p.length) throw new PackLoadError(`Invalid phrases.json for "${tag}": ${p.join('; ')}`, tag);
  return ph as PackPhrases;
}

export function validateRules(r: unknown, tag?: string): PackRules {
  const p: string[] = [];
  if (!isObj(r)) throw new PackLoadError(`rules.json for "${tag}" must be a JSON object`, tag);
  if (r.formatVersion !== 1) p.push('formatVersion must be 1');
  const words = isObj(r.words) ? r.words : {};
  const num = r.numbers;
  if (!isObj(num) || !isObj(num.atoms)) p.push('numbers.atoms is required');
  else {
    for (let d = 0; d <= 9; d++) if (num.atoms[String(d)] === undefined) p.push(`numbers.atoms is missing "${d}" (0-9 are required)`);
    const joiners = isObj(num.joiners) ? num.joiners : {};
    const checkJoin = (where: string, js: unknown): void => {
      if (js === undefined) return;
      if (!Array.isArray(js)) return void p.push(`${where} must be an array`);
      for (const j of js) if (!isObj(j) || typeof j.token !== 'string' || !(j.token in joiners)) p.push(`${where}: unknown joiner ${JSON.stringify(isObj(j) ? j.token : j)}`);
    };
    checkJoin('numbers.join', num.join);
    if (num.scales !== undefined) {
      if (!Array.isArray(num.scales)) p.push('numbers.scales must be an array');
      else
        num.scales.forEach((s, i) => {
          if (!isObj(s) || typeof s.value !== 'number' || typeof s.word !== 'string') p.push(`numbers.scales[${i}] needs value and word`);
          else checkJoin(`numbers.scales[${i}].join`, s.join);
        });
    }
    if (isObj(num.overrides)) {
      for (const [k, o] of Object.entries(num.overrides)) {
        if (!/^\d+(-\d+)?$/.test(k)) p.push(`numbers.overrides key "${k}" must be "n" or "lo-hi"`);
        if (!isObj(o) || (o.say === undefined && o.base === undefined)) p.push(`numbers.overrides["${k}"] needs say or base`);
        else checkJoin(`numbers.overrides["${k}"].join`, o.join);
      }
    }
  }
  const tpl = (where: string, t: unknown, slots: string[]): void => {
    if (typeof t !== 'string') return void p.push(`${where} must be a string`);
    try {
      for (const part of parseTemplate(t)) {
        if (part.kind === 'slot' && !slots.includes(part.name)) p.push(`${where}: unknown slot {${part.name}}`);
        if (part.kind === 'word' && !(part.key in words)) p.push(`${where}: {w:${part.key}} is not in words`);
      }
    } catch (e) {
      p.push(`${where}: ${(e as Error).message}`);
    }
  };
  if (r.money !== undefined) {
    if (!isObj(r.money) || !isObj(r.money.currencies)) p.push('money.currencies is required');
    else tpl('money.template', r.money.template, ['amount', 'currency', 'link']);
  }
  if (r.dates !== undefined) {
    const d = r.dates;
    if (!isObj(d)) p.push('dates must be an object');
    else {
      if (!Array.isArray(d.months) || d.months.length !== 12) p.push('dates.months must have 12 names');
      if (d.weekdays !== undefined && (!Array.isArray(d.weekdays) || d.weekdays.length !== 7)) p.push('dates.weekdays must have 7 names, Monday first');
      if (!isObj(d.templates)) p.push('dates.templates is required');
      else for (const [k, t] of Object.entries(d.templates)) tpl(`dates.templates.${k}`, t, ['day', 'month', 'year', 'weekday']);
    }
  }
  if (r.phones !== undefined) {
    const ph = r.phones;
    if (!isObj(ph) || !Array.isArray(ph.groups) || !(ph.read === 'number' || ph.read === 'digits')) p.push('phones needs groups[] and read ("number"|"digits")');
  }
  if (p.length) throw new PackLoadError(`Invalid rules.json for "${tag}": ${p.join('; ')}`, tag);
  return r as unknown as PackRules;
}

export function validatePack(pack: LanguagePack): void {
  validateManifest(pack.manifest, pack.manifest?.tag);
  validatePhrases(pack.phrases, pack.manifest.tag);
  validateRules(pack.rules, pack.manifest.tag);
}
