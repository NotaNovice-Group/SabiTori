/**
 * What a downloaded file must contain before the update client keeps it. The signature and hash prove the file is
 * the one the publisher signed; this proves the app can use it. A single unusable JSON file (a manifest the app
 * refuses, a rules.json that cannot say a number, a region without a phone pattern) would otherwise be installed
 * and could stop the app from starting, so one bad file fails the whole update.
 *
 * The checks are the speech package's own validators, the ones the app applies when it loads a pack, plus minimal
 * shape checks for files the speech package does not read (reading.json, region.json, Piper configs).
 */
import { isLangTag, parseAudioIndex, parsePiperConfig, validateManifest, validatePhrases, validateRules } from '@sabitori/speech/validate';

/** A file that cannot be used. `message` is plain words about the problem; `path` is the file. */
export class ContentError extends Error {
  readonly path: string;
  // No parameter property: the maintenance scripts run this file with Node's type stripping, which does not support them.
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ContentError';
    this.path = path;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function parseJson(path: string, bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ContentError(path, 'is not valid JSON');
  }
}

function readingShape(j: unknown, tag: string): void {
  const bad = (m: string): never => {
    throw new Error(m);
  };
  if (!isObj(j)) return bad('must be a JSON object');
  if (j.formatVersion !== 1) bad('formatVersion must be 1');
  if (j.tag !== tag) bad(`tag "${String(j.tag)}" does not match folder "${tag}"`);
  const lists = (name: string, n: number): void => {
    const v = j[name];
    if (!Array.isArray(v) || v.length !== n) bad(`${name} must be ${n} lists`);
    (v as unknown[]).forEach((l, i) => {
      if (!Array.isArray(l) || l.length === 0 || !l.every(isStr)) bad(`${name}[${i}] must be a non-empty list of non-empty strings`);
    });
  };
  lists('months', 12);
  lists('weekdays', 7);
  if (j.stopwords !== undefined && !strList(j.stopwords)) bad('stopwords must be a list of strings');
  if (j.relativeDays !== undefined && (!isObj(j.relativeDays) || Object.values(j.relativeDays).some((n) => !Number.isInteger(n)))) bad('relativeDays must map words to whole numbers');
}

function regionShape(j: unknown, code: string): void {
  const bad = (m: string): never => {
    throw new Error(m);
  };
  if (!isObj(j)) return bad('must be a JSON object');
  if (j.formatVersion !== 1) bad('formatVersion must be 1');
  if (j.code !== code) bad(`code "${String(j.code)}" does not match folder "${code}"`);
  if (!isStr(j.name)) bad('name must be a non-empty string');
  if (!isStr(j.timezone)) bad('timezone must be a non-empty string');
  else
    try {
      new Intl.DateTimeFormat('en', { timeZone: j.timezone });
    } catch {
      bad(`timezone "${j.timezone}" is not a known time zone`);
    }
  const cur = j.currency;
  if (!isObj(cur) || !isStr(cur.code) || !strList(cur.aliases)) bad('currency must be {"code": string, "aliases": string[]}');
  const ph = j.phone;
  if (!isObj(ph) || !/^\d{1,4}$/.test(String(ph.countryCode)) || !isStr(ph.nationalPattern)) bad('phone must be {"countryCode": digits, "nationalPattern": regex source}');
  else {
    if ((ph.nationalPattern as string).length > 500) bad('phone.nationalPattern is too long');
    try {
      new RegExp(`^(?:${ph.nationalPattern as string})$`);
    } catch {
      bad('phone.nationalPattern is not a valid regular expression');
    }
    if (ph.mobilePrefixes !== undefined && !strList(ph.mobilePrefixes)) bad('phone.mobilePrefixes must be a list of strings');
  }
  if (!Array.isArray(j.languages) || !j.languages.every((t) => isLangTag(t)) || new Set(j.languages).size !== j.languages.length) bad('languages must be a list of different language tags');
  if (!Array.isArray(j.officialSenders)) return bad('officialSenders must be a list');
  const ids = new Set<string>();
  j.officialSenders.forEach((s, i) => {
    const w = `officialSenders[${i}]`;
    if (!isObj(s) || !isStr(s.id) || !/^[A-Za-z0-9_.-]+$/.test(s.id) || !isStr(s.displayName)) return bad(`${w} needs an id (letters, digits, "_", ".", "-") and a displayName`);
    if (ids.has(s.id)) bad(`${w}: id "${s.id}" is repeated`);
    ids.add(s.id);
    if (!strList(s.aliases) || !strList(s.smsSenderIds) || !strList(s.shortCodes)) bad(`${w}: aliases, smsSenderIds and shortCodes must be lists of strings`);
    if (typeof s.verified !== 'boolean') bad(`${w}: verified must be true or false`);
    if (!isStr(s.kind)) bad(`${w}: kind must be a string`);
  });
}

/**
 * Throws ContentError when the file cannot be used by the app. Files are identified by their (already
 * allow-listed) path. Binary files (audio clips, Piper models) only have to be non-empty.
 */
export function validateUpdateFile(path: string, bytes: Uint8Array): void {
  const fail = (m: string): never => {
    throw new ContentError(path, m);
  };
  if (bytes.length === 0) fail('is empty');
  const m = /^packs\/([^/]+)\/(manifest|phrases|rules|reading|index)\.json$/.exec(path);
  const tag = m?.[1];
  const wrap = (f: () => void): void => {
    try {
      f();
    } catch (e) {
      if (e instanceof ContentError) throw e;
      fail(e instanceof Error ? e.message : String(e));
    }
  };
  if (path === 'packs/index.json') {
    const j = parseJson(path, bytes);
    wrap(() => {
      const list = isObj(j) ? j.packs : undefined;
      if (!Array.isArray(list) || !list.every((t) => isLangTag(t))) throw new Error('must look like {"packs":["fr","en"]} with valid language tags');
      if (new Set(list).size !== list.length) throw new Error('lists a language twice');
    });
  } else if (m && tag) {
    const j = parseJson(path, bytes);
    const kind = m[2];
    wrap(() => {
      if (!isLangTag(tag)) throw new Error(`"${tag}" is not a valid language tag`);
      if (kind === 'manifest') validateManifest(j, tag);
      else if (kind === 'phrases') validatePhrases(j, tag);
      else if (kind === 'rules') validateRules(j, tag);
      else if (kind === 'reading') readingShape(j, tag);
      else if (!isObj(j)) throw new Error('must be a JSON object'); // packs/<tag>/index.json: checked in full by the client
    });
  } else if (/^packs\/[^/]+\/audio\/index\.json$/.test(path)) {
    const j = parseJson(path, bytes);
    wrap(() => void parseAudioIndex(j, path.split('/')[1]));
  } else if (/\/voice\/[^/]+\.onnx\.json$/.test(path)) {
    const j = parseJson(path, bytes);
    wrap(() => void parsePiperConfig(j));
  } else if (/^regions\/[A-Z]{2}\/region\.json$/.test(path)) {
    const j = parseJson(path, bytes);
    wrap(() => regionShape(j, path.split('/')[1]!));
  }
  // Anything else (audio clips, .onnx models) is binary: only "not empty" can be said without decoding it.
}
