/**
 * Removes everything personal from a crash report before it can leave the phone.
 * Pure functions, no network, no Sentry import: unit-tested on realistic payloads.
 *
 * Rules, applied to every string that is kept:
 *   1. any stretch of 6+ characters that also appears in a message the person had on screen
 *   2. dates, amounts, phone numbers, email addresses, USSD codes
 *   3. every run of 3 or more digits
 * Everything else in the event is dropped (request, user, extra, breadcrumbs, local variables, source lines).
 */

const MIN_OVERLAP = 6;
const KEEP_MESSAGES = 3;
let messages: string[] = [];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

/** Remember a message that is on screen (kept in memory only, last few). */
export function noteMessageText(text: string | null | undefined): void {
  const t = norm(text ?? '').trim();
  if (t.length < MIN_OVERLAP) return;
  // typing or editing the same message replaces its earlier versions instead of crowding out other messages
  messages = [t, ...messages.filter((m) => !m.includes(t) && !t.includes(m))].slice(0, KEEP_MESSAGES);
}

/** Sender names and other short personal words on screen (history rows, the sender box): scrubbed as whole words. */
const KEEP_NAMES = 100;
let names: string[] = [];

export function noteName(name: string | null | undefined): void {
  const n = norm(name ?? '').trim();
  if (n.length < 2 || !/\p{L}|\d/u.test(n)) return;
  // typing a name letter by letter replaces its earlier, shorter versions
  names = [n, ...names.filter((x) => !n.startsWith(x) && !x.startsWith(n))].slice(0, KEEP_NAMES);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace every remembered name (case-insensitive, whole words only, any spacing). */
export function scrubNames(s: string, list: string[] = names): string {
  let out = s;
  for (const n of [...list].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${n.split(' ').map(escapeRe).join('\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
    out = out.replace(re, '[name]');
  }
  return out;
}

export function forgetMessageTexts(): void {
  messages = [];
  names = [];
}

export function currentMessageTexts(): string[] {
  return messages;
}

const MONTHS = '(?:jan|janv|janvier|january|feb|fév|fev|févr|fevr|février|fevrier|february|mar|mars|march|apr|avr|avril|april|mai|may|jun|juin|june|jul|juil|juillet|july|aug|aoû|aou|août|aout|august|sep|sept|septembre|september|oct|octobre|october|nov|novembre|november|dec|déc|décembre|decembre|december)';
const CUR = '(?:FCFA|F\\s?CFA|XAF|XOF|CFA|francs?|frs?|F)';
const SEP = '[ \\u00a0\\u202f.,\']';

const PATTERNS: [RegExp, string][] = [
  [/https?:\/\/[^\s"'<>)]+/gi, '[link]'],
  [/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, '[email]'],
  [/[*#]\d[\d*#]*#/g, '[code]'],
  // dates
  [/\b\d{4}-\d{1,2}-\d{1,2}(?:[T ][\d:.]+Z?)?/g, '[date]'],
  [/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, '[date]'],
  [new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th|er)?\\s+(?:of\\s+)?${MONTHS}\\b\\.?(?:\\s+\\d{2,4})?`, 'gi'), '[date]'],
  [new RegExp(`\\b${MONTHS}\\b\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?`, 'gi'), '[date]'],
  // amounts: a number with a currency word before or after, or a number grouped in thousands
  [new RegExp(`\\b(?:${CUR})\\s*\\d+(?:${SEP}\\d+)*`, 'gi'), '[amount]'],
  [new RegExp(`\\d+(?:${SEP}\\d+)*\\s*(?:${CUR})(?![A-Za-z])`, 'gi'), '[amount]'],
  [new RegExp(`\\b\\d{1,3}(?:${SEP}\\d{3})+(?!\\d)`, 'g'), '[amount]'],
  // phone numbers: 7+ characters of digits and separators, optional +
  [/\+?\d[\d ()  .\-]{5,}\d/g, '[phone]'],
  [/\d{3,}/g, '[number]'],
];

/** Replace every stretch (>= MIN_OVERLAP chars) that also occurs in a remembered message. */
export function scrubMessageOverlap(s: string, texts: string[] = messages): string {
  if (!texts.length || s.length < MIN_OVERLAP) return s;
  const lower = s.toLowerCase();
  const grams = new Set<string>();
  for (const m of texts) for (let i = 0; i + MIN_OVERLAP <= m.length; i++) grams.add(m.slice(i, i + MIN_OVERLAP));
  const hit = new Array<boolean>(s.length).fill(false);
  // the message was normalised (lower case, single spaces); do the same to s but keep index mapping
  const idx: number[] = [];
  let n = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]!;
    if (/\s/.test(ch)) {
      if (n.endsWith(' ')) continue;
      n += ' ';
    } else n += ch;
    idx.push(i);
  }
  let any = false;
  for (let i = 0; i + MIN_OVERLAP <= n.length; i++) {
    const g = n.slice(i, i + MIN_OVERLAP);
    if (grams.has(g) && /[^\s\p{P}]/u.test(g)) {
      for (let k = i; k < i + MIN_OVERLAP; k++) hit[idx[k]!] = true;
      any = true;
    }
  }
  if (!any) return s;
  let out = '';
  let inRun = false;
  for (let i = 0; i < s.length; i++) {
    if (hit[i]) {
      if (!inRun) out += '[message]';
      inRun = true;
    } else {
      inRun = false;
      out += s[i];
    }
  }
  return out;
}

/** Scrub one free-text string. */
/**
 * Names nobody saw on screen can still reach an error text ("... pour Jean Paul Mbarga"): two or more
 * capitalised words in a row ("Jean Paul", "Marie-Claire Ngo") are treated as a name. Code identifiers such
 * as TypeError or NetworkError have an inner capital and are not touched.
 */
const NAME_LIKE = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+(?:[ \-\u00a0]+\p{Lu}\p{Ll}+)+(?![\p{L}\p{N}])/gu;
export function scrubNameLike(s: string): string {
  return s.replace(NAME_LIKE, '[name]');
}

export function scrubString(s: string, texts: string[] = messages): string {
  let out = scrubNameLike(scrubNames(scrubMessageOverlap(s, texts)));
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  // replacements may have glued or created new runs next to message markers; one more pass is cheap
  return out;
}

/** Fields that identify the structure of an event and are safe as they are. */
type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v ? v.slice(0, max) : undefined);

/** Version-like and name-like values (OS, device, release, pack versions): letters, digits, dots, dashes, spaces. */
const simple = (v: unknown, texts: string[] = messages): string | undefined => {
  const s = str(v, 64);
  return s && /^[\w .+\-:()/]+$/.test(s) ? scrubNames(scrubMessageOverlap(s, texts)) : undefined;
};

function scrubFrame(f: unknown, texts: string[]): Json | null {
  if (!isObj(f)) return null;
  const out: Json = {};
  for (const k of ['filename', 'function', 'module'] as const) {
    const v = str(f[k], 300);
    // a file name is our own bundle path: keep it readable, still drop message overlaps and long numbers
    if (v) out[k] = k === 'filename' ? scrubNames(scrubMessageOverlap(v.replace(/^[a-z]+:\/\/[^/]*/i, ''), texts).replace(/\d{3,}/g, '#')) : scrubString(v, texts);
  }
  for (const k of ['lineno', 'colno'] as const) if (typeof f[k] === 'number') out[k] = f[k];
  if (typeof f.in_app === 'boolean') out.in_app = f.in_app;
  return out;
}

function scrubException(ex: unknown, texts: string[]): Json | null {
  if (!isObj(ex)) return null;
  const out: Json = {};
  const type = str(ex.type);
  if (type) out.type = scrubString(type, texts);
  const value = str(ex.value, 1000);
  if (value) out.value = scrubString(value, texts);
  if (isObj(ex.mechanism)) {
    out.mechanism = { type: simple(ex.mechanism.type) ?? 'generic', handled: ex.mechanism.handled === true };
  }
  if (isObj(ex.stacktrace) && Array.isArray(ex.stacktrace.frames)) {
    out.stacktrace = { frames: ex.stacktrace.frames.map((f) => scrubFrame(f, texts)).filter((f): f is Json => f !== null) };
  }
  return out;
}

export interface ScrubContext {
  texts?: string[];
  appVersion: string;
  packVersions: Record<string, string>;
}

/**
 * Builds the event that may be sent from the one Sentry produced: an allow-list, not a deny-list.
 * Never throws: on any doubt the event is dropped (returns null).
 */
export function scrubEvent(event: unknown, ctx: ScrubContext): Json | null {
  try {
    if (!isObj(event)) return null;
    const texts = ctx.texts ?? messages;
    const out: Json = {};
    for (const k of ['event_id', 'timestamp', 'platform', 'level'] as const) if (event[k] !== undefined) out[k] = event[k];
    out.release = ctx.appVersion;
    if (str(event.environment)) out.environment = simple(event.environment);
    if (isObj(event.sdk)) out.sdk = { name: simple(event.sdk.name), version: simple(event.sdk.version) };
    if (isObj(event.exception) && Array.isArray(event.exception.values)) {
      out.exception = { values: event.exception.values.map((v) => scrubException(v, texts)).filter((v) => v !== null) };
    }
    const message = typeof event.message === 'string' ? event.message : isObj(event.logentry) ? str(event.logentry.formatted ?? event.logentry.message, 1000) : undefined;
    if (message) out.message = scrubString(message, texts);
    const tags: Record<string, string> = { app_version: ctx.appVersion };
    for (const [tag, v] of Object.entries(ctx.packVersions)) tags[`pack_${tag}`] = v;
    out.tags = tags;
    const contexts: Json = { app: { app_version: ctx.appVersion } };
    if (isObj(event.contexts)) {
      const { os, device } = event.contexts as { os?: unknown; device?: unknown };
      if (isObj(os)) contexts.os = { name: simple(os.name), version: simple(os.version) };
      // Only the CPU architecture: device family and model name are fingerprinting data we do not need.
      if (isObj(device)) contexts.device = { arch: simple(device.arch) };
    }
    out.contexts = contexts;
    return out;
  } catch {
    return null;
  }
}
