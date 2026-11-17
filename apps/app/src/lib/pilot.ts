/**
 * Pilot counters (docs/impact.md). Present only in a pilot build (VITE_PILOT=1); absent otherwise.
 *
 * Counts what happened on this phone, never what a message said: no text, no numbers, no senders, no
 * dates of messages. The counts stay on the phone, the participant sees them in Settings, and only the
 * participant can share them (as plain text they read first). Nothing is sent anywhere by the app.
 */

export type PilotEvent =
  | { type: 'explained'; source: 'photo' | 'share' | 'paste' | 'example'; mode: 'full' | 'facts_only'; scam: 'likely_scam' | 'caution' | 'no_signs' }
  | { type: 'listened' }
  | { type: 'reminder' };

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

const emptyWeek = (week: string): PilotWeek => ({
  week, explained: 0, fromPhoto: 0, fromShare: 0, fromPaste: 0, practice: 0, factsOnly: 0, scamWarnings: 0, cautionWarnings: 0, listened: 0, reminders: 0,
});

const NUMERIC: (keyof PilotWeek)[] = ['explained', 'fromPhoto', 'fromShare', 'fromPaste', 'practice', 'factsOnly', 'scamWarnings', 'cautionWarnings', 'listened', 'reminders'];

function valid(x: unknown): x is PilotData {
  if (!x || typeof x !== 'object') return false;
  const d = x as PilotData;
  return d.version === 1 && typeof d.since === 'string' && Array.isArray(d.weeks) &&
    d.weeks.every((w) => w && typeof w.week === 'string' && NUMERIC.every((k) => Number.isInteger(w[k]) && (w[k] as number) >= 0));
}

export function createPilot(store: KeyValueStore | null, now: () => Date = () => new Date()) {
  const read = (): PilotData | null => {
    if (!store) return null;
    try {
      const raw = store.getItem(PILOT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as unknown;
      return valid(d) ? d : null;
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
        }
      } else if (ev.type === 'listened') w.listened++;
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
  return lines.join('\n');
}

export const pilotTotals = (d: PilotData | null): PilotWeek =>
  (d?.weeks ?? []).reduce((t, w) => {
    for (const k of NUMERIC) (t[k] as number) += w[k] as number;
    return t;
  }, emptyWeek('total'));

/** Count one explained message from its card (no content is read beyond source, mode and scam level). */
export function recordExplained(p: Pilot, card: { input: { source: 'photo' | 'share' | 'paste' }; mode: 'full' | 'facts_only'; scam: { level: 'likely_scam' | 'caution' | 'no_signs' } }, example = false): void {
  p.record({ type: 'explained', source: example ? 'example' : card.input.source, mode: card.mode, scam: card.scam.level });
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
