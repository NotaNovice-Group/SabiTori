/**
 * Pilot counters (docs/impact.md). Present only in a pilot build (VITE_PILOT=1); absent otherwise.
 *
 * Counts what happened on this phone, never what a message said: no text, no numbers, no senders, no
 * dates of messages. The counts stay on the phone, the participant sees them in Settings, and only the
 * participant can share them (as plain text they read first). Nothing is sent anywhere by the app.
 */

export type PilotEvent =
  | { type: 'explained'; source: 'photo' | 'share' | 'paste' | 'example'; mode: 'full' | 'facts_only'; scam: 'likely_scam' | 'caution' | 'no_signs'; ms?: number }
  | { type: 'listened' }
  | { type: 'first_audio'; ms: number }
  | { type: 'reminder' };

/**
 * How long things took on this phone, kept as counts per time band (never a list of times): the pilot's
 * "phone performance" measure (docs/impact.md). Band upper limits in seconds; the last band is "longer".
 */
export const TIMING_BANDS = {
  /** photo taken -> card on screen (sharpness check, OCR, understanding) */
  photoSec: [5, 10, 20, 40],
  /** paste or share -> card on screen */
  textSec: [1, 2, 5],
  /** Listen pressed -> first section starts speaking */
  audioSec: [1, 2, 5],
} as const;
export type TimingKey = keyof typeof TIMING_BANDS;
const TIMING_KEYS = Object.keys(TIMING_BANDS) as TimingKey[];

export function band(key: TimingKey, ms: number): number {
  const limits = TIMING_BANDS[key];
  const i = limits.findIndex((l) => ms < l * 1000);
  return i === -1 ? limits.length : i;
}

export interface PilotWeek {
  /** ISO week, e.g. "2026-W47". */
  week: string;
  explained: number;
  fromPhoto: number;
  fromShare: number;
  fromPaste: number;
  practice: number;
  factsOnly: number;
  scamWarnings: number;
  cautionWarnings: number;
  listened: number;
  reminders: number;
  /** Counts per time band (TIMING_BANDS); weeks stored before timing existed read as all zeros. */
  photoSec: number[];
  textSec: number[];
  audioSec: number[];
}

export interface PilotData {
  version: 1;
  /** The day counting started on this phone (YYYY-MM-DD), so a participant can tell week 1 from week 4. */
  since: string;
  weeks: PilotWeek[];
}

export const PILOT_KEY = 'sabitori.pilot.v1';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ISO-8601 week of a local date, e.g. "2026-W47". */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const zeros = (k: TimingKey) => new Array<number>(TIMING_BANDS[k].length + 1).fill(0);
const emptyWeek = (week: string): PilotWeek => ({
  week, explained: 0, fromPhoto: 0, fromShare: 0, fromPaste: 0, practice: 0, factsOnly: 0, scamWarnings: 0, cautionWarnings: 0, listened: 0, reminders: 0,
  photoSec: zeros('photoSec'), textSec: zeros('textSec'), audioSec: zeros('audioSec'),
});
const bump = (a: number[], i: number, by = 1) => void (a[i] = (a[i] ?? 0) + by);
const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;

const NUMERIC: (keyof PilotWeek)[] = ['explained', 'fromPhoto', 'fromShare', 'fromPaste', 'practice', 'factsOnly', 'scamWarnings', 'cautionWarnings', 'listened', 'reminders'];

function valid(x: unknown): x is PilotData {
  if (!x || typeof x !== 'object') return false;
  const d = x as PilotData;
  return d.version === 1 && typeof d.since === 'string' && Array.isArray(d.weeks) &&
    d.weeks.every((w) => w && typeof w.week === 'string' && NUMERIC.every((k) => count(w[k])) &&
      TIMING_KEYS.every((k) => w[k] === undefined || (Array.isArray(w[k]) && w[k].length === TIMING_BANDS[k].length + 1 && w[k].every(count))));
}

/** Weeks counted before timing existed get zero bands. */
const withTiming = (d: PilotData): PilotData => ({
  ...d,
  weeks: d.weeks.map((w) => ({ ...w, ...Object.fromEntries(TIMING_KEYS.map((k) => [k, w[k] ?? zeros(k)])) })),
});

export function createPilot(store: KeyValueStore | null, now: () => Date = () => new Date()) {
  const read = (): PilotData | null => {
    if (!store) return null;
    try {
      const raw = store.getItem(PILOT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as unknown;
      return valid(d) ? withTiming(d) : null;
    } catch {
      return null;
    }
  };

  return {
    read,
    record(ev: PilotEvent): void {
      if (!store) return;
      const date = now();
      const data = read() ?? { version: 1 as const, since: ymd(date), weeks: [] };
      const key = isoWeek(date);
      let w = data.weeks.find((x) => x.week === key);
      if (!w) {
        w = emptyWeek(key);
        data.weeks.push(w);
        data.weeks.sort((a, b) => a.week.localeCompare(b.week));
      }
      if (ev.type === 'explained') {
        if (ev.source === 'example') w.practice++;
        else {
          w.explained++;
          if (ev.source === 'photo') w.fromPhoto++;
          else if (ev.source === 'share') w.fromShare++;
          else w.fromPaste++;
          if (ev.mode === 'facts_only') w.factsOnly++;
          if (ev.scam === 'likely_scam') w.scamWarnings++;
          else if (ev.scam === 'caution') w.cautionWarnings++;
          if (ev.ms !== undefined && Number.isFinite(ev.ms) && ev.ms >= 0) {
            const k: TimingKey = ev.source === 'photo' ? 'photoSec' : 'textSec';
            bump(w[k], band(k, ev.ms));
          }
        }
      } else if (ev.type === 'listened') w.listened++;
      else if (ev.type === 'first_audio') {
        if (Number.isFinite(ev.ms) && ev.ms >= 0) bump(w.audioSec, band('audioSec', ev.ms));
      }
      else w.reminders++;
      try {
        store.setItem(PILOT_KEY, JSON.stringify(data));
      } catch {
        /* storage full or blocked: counting is best effort and must never break the app */
      }
    },
    reset(): void {
      try {
        store?.removeItem(PILOT_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

export type Pilot = ReturnType<typeof createPilot>;

/** The text a participant can read and choose to share: counts only, one line per week. */
export function pilotSummary(d: PilotData | null, appVersion: string): string {
  const lines = [`SabiTori pilot numbers (app ${appVersion})`];
  if (!d || d.weeks.length === 0) return [...lines, 'No messages yet.'].join('\n');
  lines.push(`Counting since ${d.since}`);
  lines.push('week | explained (photo/share/paste) | facts only | scam warnings | caution | listened | reminders | practice');
  for (const w of d.weeks) {
    lines.push(`${w.week} | ${w.explained} (${w.fromPhoto}/${w.fromShare}/${w.fromPaste}) | ${w.factsOnly} | ${w.scamWarnings} | ${w.cautionWarnings} | ${w.listened} | ${w.reminders} | ${w.practice}`);
  }
  const t = pilotTotals(d);
  const bands = (k: TimingKey) => {
    const lim = TIMING_BANDS[k];
    return t[k].map((n, i) => `${i === 0 ? `<${lim[0]}` : i === lim.length ? `${lim[i - 1]}+` : `${lim[i - 1]}-${lim[i]}`}s: ${n}`).join(', ');
  };
  lines.push('Time on this phone (all weeks, number of times in each band)');
  lines.push(`photo to card | ${bands('photoSec')}`);
  lines.push(`text to card | ${bands('textSec')}`);
  lines.push(`Listen to first sound | ${bands('audioSec')}`);
  return lines.join('\n');
}

export const pilotTotals = (d: PilotData | null): PilotWeek =>
  (d?.weeks ?? []).reduce((t, w) => {
    for (const k of NUMERIC) (t[k] as number) += w[k] as number;
    for (const k of TIMING_KEYS) (w[k] ?? []).forEach((n, i) => bump(t[k], i, n));
    return t;
  }, emptyWeek('total'));

/** Count one explained message from its card (no content is read beyond source, mode and scam level). */
export function recordExplained(p: Pilot, card: { input: { source: 'photo' | 'share' | 'paste' }; mode: 'full' | 'facts_only'; scam: { level: 'likely_scam' | 'caution' | 'no_signs' } }, example = false, ms?: number): void {
  p.record({ type: 'explained', source: example ? 'example' : card.input.source, mode: card.mode, scam: card.scam.level, ...(ms === undefined ? {} : { ms }) });
}

/** The app's pilot instance: a real store only in a pilot build. */
function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export const pilotEnabled = (env: Record<string, string | undefined>): boolean => (env.VITE_PILOT ?? '').trim() === '1';

export const pilot: Pilot = createPilot(
  pilotEnabled(import.meta.env as unknown as Record<string, string | undefined>) ? browserStore() : null,
);
