import type { Card } from '@sabitori/core';
import type { ExtraKey } from '../engine/extra';

/** Short-lived, in-memory hand-offs between screens. Nothing here is persisted. */
const cards = new Map<string, Card>();
let photo: File | null = null;
let sharedText: string | null = null;
let resume: string | null = null;
let notice: ExtraKey | null = null;

/** Longest shared or pasted text the app reads. A message is a few hundred characters; this is a book chapter. */
export const MAX_TEXT_CHARS = 20_000;

export const session = {
  putCard(card: Card) {
    cards.set(card.id, card);
  },
  getCard(id: string): Card | undefined {
    return cards.get(id);
  },
  /** A deleted card must not come back from this session's memory. */
  dropCard(id: string) {
    cards.delete(id);
  },
  clearCards() {
    cards.clear();
  },
  setPhoto(f: File | null) {
    photo = f;
  },
  takePhoto(): File | null {
    return photo;
  },
  setSharedText(t: string | null) {
    sharedText = t;
  },
  takeSharedText(): string | null {
    const t = sharedText;
    sharedText = null;
    return t;
  },
  /** Where to go once the first-run screens are done (a share that arrived before the language was chosen). */
  setResume(route: string | null) {
    resume = route;
  },
  takeResume(): string | null {
    const r = resume;
    resume = null;
    return r;
  },
  /** One quiet message for the next screen (for example "only the first photo is read"). */
  setNotice(k: ExtraKey | null) {
    notice = k;
  },
  takeNotice(): ExtraKey | null {
    const n = notice;
    notice = null;
    return n;
  },
};

/** Cut a text to MAX_TEXT_CHARS. `cut` says whether anything was left out. */
export function capText(text: string, max = MAX_TEXT_CHARS): { text: string; cut: boolean } {
  if (text.length <= max) return { text, cut: false };
  let end = max;
  // do not split a surrogate pair
  const c = text.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end--;
  return { text: text.slice(0, end), cut: true };
}

/** Text shared into the app (Android share sheet -> manifest share_target, GET). */
export function readShareTarget(): string | null {
  const q = new URLSearchParams(location.search);
  const text = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').trim();
  if (!text) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  return text;
}
