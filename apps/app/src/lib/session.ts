import type { Card } from '@sabitori/core';

/** Short-lived, in-memory hand-offs between screens. Nothing here is persisted. */
const cards = new Map<string, Card>();
let photo: File | null = null;
let sharedText: string | null = null;

export const session = {
  putCard(card: Card) {
    cards.set(card.id, card);
  },
  getCard(id: string): Card | undefined {
    return cards.get(id);
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
};

/** Text shared into the app (Android share sheet -> manifest share_target, GET). */
export function readShareTarget(): string | null {
  const q = new URLSearchParams(location.search);
  const text = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').trim();
  if (!text) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  return text;
}
