/** Input checks for the community service. Pure: unit-tested without a Worker runtime. */

export const LIMITS = {
  text: 1500,
  senderValue: 40,
  claimed: 60,
  signals: 12,
  signal: 32,
  phrase: 300,
  meaning: 300,
  dialect: 40,
  audioBytes: 1_500_000,
} as const;

export const AUDIO_TYPES: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav' };

export interface ScamReportIn {
  region: string;
  lang: string;
  level: 'likely_scam' | 'caution';
  text: string;
  sender: { kind: 'number' | 'name' | 'unknown'; value?: string };
  claimed?: string;
  signals: string[];
  appVersion?: string;
}

export interface TeachingIn {
  lang: string;
  dialect?: string;
  phrase?: string;
  meaning: string;
  meaningLang: 'en' | 'fr';
  promptId?: string;
  audio?: { base64: string; type: string };
  appVersion?: string;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // control characters out (keep newlines and tabs), whitespace runs collapsed at the ends
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return s && s.length <= max ? s : undefined;
};
const tag = (v: unknown): string | undefined => (typeof v === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v) ? v : undefined);
const region = (v: unknown): string | undefined => (typeof v === 'string' && /^[A-Z]{2}$/.test(v) ? v : undefined);
const version = (v: unknown): string | undefined => (typeof v === 'string' && /^[0-9A-Za-z.+-]{1,24}$/.test(v) ? v : undefined);

export function checkScamReport(body: unknown): Checked<ScamReportIn> {
  const b = (body ?? {}) as Record<string, unknown>;
  const r = region(b.region);
  if (!r) return { ok: false, error: 'region' };
  const lang = tag(b.lang);
  if (!lang) return { ok: false, error: 'lang' };
  if (b.level !== 'likely_scam' && b.level !== 'caution') return { ok: false, error: 'level' };
  const text = str(b.text, LIMITS.text);
  if (!text || text.length < 8) return { ok: false, error: 'text' };
  const s = (b.sender ?? {}) as Record<string, unknown>;
  const kind = s.kind === 'number' || s.kind === 'name' ? s.kind : 'unknown';
  const value = kind === 'unknown' ? undefined : str(s.value, LIMITS.senderValue);
  if (kind === 'number' && value && !/^\+?\d{3,15}$/.test(value)) return { ok: false, error: 'sender' };
  const signals = Array.isArray(b.signals) ? b.signals.filter((x): x is string => typeof x === 'string' && /^[a-z_]{2,32}$/.test(x)).slice(0, LIMITS.signals) : [];
  const claimed = str(b.claimed, LIMITS.claimed);
  const appVersion = version(b.appVersion);
  return {
    ok: true,
    value: {
      region: r, lang, level: b.level, text,
      sender: value ? { kind, value } : { kind: 'unknown' },
      signals,
      ...(claimed ? { claimed } : {}),
      ...(appVersion ? { appVersion } : {}),
    },
  };
}

/** Bytes a base64 string decodes to (without decoding it). */
export const base64Bytes = (b64: string): number => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

export function checkTeaching(body: unknown): Checked<TeachingIn> {
  const b = (body ?? {}) as Record<string, unknown>;
  const lang = tag(b.lang);
  if (!lang) return { ok: false, error: 'lang' };
  const meaning = str(b.meaning, LIMITS.meaning);
  if (!meaning) return { ok: false, error: 'meaning' };
  const meaningLang = b.meaningLang === 'fr' ? 'fr' : 'en';
  const phrase = str(b.phrase, LIMITS.phrase);
  const dialect = str(b.dialect, LIMITS.dialect);
  const promptId = typeof b.promptId === 'string' && /^[a-z0-9_.-]{1,40}$/.test(b.promptId) ? b.promptId : undefined;
  let audio: TeachingIn['audio'];
  if (b.audio !== undefined && b.audio !== null) {
    const a = b.audio as Record<string, unknown>;
    const type = typeof a.type === 'string' ? a.type.split(';')[0]!.trim() : '';
    if (!(type in AUDIO_TYPES)) return { ok: false, error: 'audio_type' };
    if (typeof a.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64)) return { ok: false, error: 'audio' };
    if (base64Bytes(a.base64) > LIMITS.audioBytes) return { ok: false, error: 'audio_size' };
    audio = { base64: a.base64, type };
  }
  if (!phrase && !audio) return { ok: false, error: 'phrase' }; // something in the language: written, spoken, or both
  const appVersion = version(b.appVersion);
  return {
    ok: true,
    value: {
      lang, meaning, meaningLang,
      ...(phrase ? { phrase } : {}),
      ...(dialect ? { dialect } : {}),
      ...(promptId ? { promptId } : {}),
      ...(audio ? { audio } : {}),
      ...(appVersion ? { appVersion } : {}),
    },
  };
}
