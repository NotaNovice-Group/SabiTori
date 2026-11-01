import { CATALOG, type PhraseKey } from '@sabitori/core';

export const SECTIONS = [
  'scam', 'sender', 'about', 'action', 'deadline', 'money', 'help', 'urgency', 'facts_only', 'ui',
] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  scam: 'Scam warnings',
  sender: 'Who sent it',
  about: 'What it is about',
  action: 'What to do',
  deadline: 'When',
  money: 'Money',
  help: 'Who to ask',
  urgency: 'How urgent',
  facts_only: 'When we are unsure',
  ui: 'Buttons and screens',
};

export interface CatalogItem {
  key: PhraseKey;
  section: Section;
  en: string;
  context: string;
  slots: readonly string[];
}

export const ITEMS: CatalogItem[] = (Object.keys(CATALOG) as PhraseKey[]).map((key) => {
  const e = CATALOG[key] as { en: string; context: string; slots?: readonly string[] };
  return { key, section: key.split('.')[0] as Section, en: e.en, context: e.context, slots: e.slots ?? [] };
});

export const ITEM_BY_KEY = new Map(ITEMS.map((i) => [i.key as string, i]));

export const LICENSES = [
  {
    id: 'CC-BY-4.0',
    title: 'Open for anyone',
    text: 'Anyone may use, copy and build on this voice and text, even to sell something, as long as they name your community.',
  },
  {
    id: 'CC-BY-SA-4.0',
    title: 'Open, but share alike',
    text: 'Anyone may use and build on it, and must share what they make under the same terms. Good if you want improvements to come back to everyone.',
  },
  {
    id: 'CC-BY-NC-4.0',
    title: 'Not for commercial use',
    text: 'Anyone may use it for free, including community and public-service apps. Nobody may use it to make money without asking you first.',
  },
] as const;
export type LicenseId = (typeof LICENSES)[number]['id'];

export interface Speaker {
  id: string;
  name: string;
  role: 'speaker' | 'translator' | 'reviewer';
  /** Written consent to be named as a contributor. Without it the name is not exported. */
  consent: boolean;
}

export interface PhraseWork {
  text: string;
  review: 'none' | 'reviewed' | 'sent_back';
  note?: string;
  reviewedBy?: string;
  recordedBy?: string;
}

export interface Project {
  id: string;
  tag: string;
  name: string;
  autonym: string;
  fallback: string[];
  speakers: Speaker[];
  activeSpeakerId?: string;
  license: LicenseId | string;
  palette: string[];
  phrases: Record<string, PhraseWork>;
  /** Atom clips (numbers, months, money words): what each clip says, written by the speaker. */
  atoms: Record<string, { label: string }>;
  /** rules.json text when the community edited it, else undefined. */
  rulesText?: string;
  version: string;
  exportStatus: 'in_recording' | 'beta';
  createdAt: number;
  updatedAt: number;
}

export interface ClipRecord {
  /** Clip id, e.g. "scam.likely.0" or an atom id. */
  id: string;
  blob: Blob;
  durationMs: number;
  /** The words this clip was recorded for. If the text changes later, the clip is stale. */
  text: string;
  speakerId?: string;
  ext: 'webm' | 'm4a';
  at: number;
}

export const DEFAULT_PALETTE = [
  'ɓ', 'ɗ', 'ŋ', 'ɛ', 'ɔ', 'ə', 'ʉ', 'ɨ', 'ƴ', 'ʼ',
  '́', '̀', '̂', '̌', '̄',
];

export const MARK_NAMES: Record<string, string> = {
  '́': 'acute',
  '̀': 'grave',
  '̂': 'circumflex',
  '̌': 'caron',
  '̄': 'macron',
  '̃': 'tilde',
};

export const isMark = (ch: string) => /^\p{M}$/u.test(ch);

export function newProject(init: Pick<Project, 'tag' | 'name' | 'autonym' | 'fallback' | 'speakers' | 'license'>): Project {
  const now = Date.now();
  return {
    ...init,
    id: `${init.tag}-${now.toString(36)}`,
    activeSpeakerId: init.speakers[0]?.id,
    palette: [...DEFAULT_PALETTE],
    phrases: {},
    atoms: {},
    version: '0.1.0',
    exportStatus: 'in_recording',
    createdAt: now,
    updatedAt: now,
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

const TAG_RE = /^[a-z]{2,3}$/;
export function validateTag(tag: string): string | null {
  if (!tag) return 'Enter a language code.';
  if (!TAG_RE.test(tag)) return 'Use two or three lowercase letters, like ewo or fub.';
  return null;
}
