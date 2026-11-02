export type Retention = 30 | 7 | 0;
export type SpeedStep = 0 | 1 | 2;
export interface Settings {
  onboarded: boolean;
  lang: string;
  listenFirst: boolean;
  speed: SpeedStep;
  retention: Retention;
  region: string;
  /** Optional: download updates (only offered when configured). Off until the person turns it on. */
  updatesOn: boolean;
  /** Optional: send error reports without messages (only offered when configured). */
  crashOn: boolean;
}

export const SPEEDS: readonly number[] = [1, 0.8, 0.6];

export const DEFAULTS: Settings = {
  onboarded: false,
  lang: 'fr',
  listenFirst: false,
  speed: 0,
  retention: 30,
  region: 'CM',
  updatesOn: false,
  crashOn: false,
};

const KEY = 'sabitori.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

export function sanitize(v: unknown): Settings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    onboarded: o.onboarded === true,
    lang: typeof o.lang === 'string' && o.lang ? o.lang : DEFAULTS.lang,
    listenFirst: o.listenFirst === true,
    speed: o.speed === 1 || o.speed === 2 ? o.speed : 0,
    retention: o.retention === 7 || o.retention === 0 ? o.retention : 30,
    region: typeof o.region === 'string' && o.region ? o.region : DEFAULTS.region,
    updatesOn: o.updatesOn === true,
    crashOn: o.crashOn === true,
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or full: settings last for this session only */
  }
}
