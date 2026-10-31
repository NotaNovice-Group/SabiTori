import type { ClipRecord, Project } from './model';
import { ITEMS, ITEM_BY_KEY, SECTIONS, type Section } from './model';
import { phraseRecordedState } from './pack';
import { validateSlots } from './slots';

export type ItemState = 'todo' | 'invalid' | 'written' | 'partial' | 'stale' | 'recorded' | 'reviewed' | 'sent_back';

export function itemState(p: Project, clips: ReadonlyMap<string, ClipRecord>, key: string): ItemState {
  const w = p.phrases[key];
  const text = w?.text.trim();
  if (!w || !text) return 'todo';
  const item = ITEM_BY_KEY.get(key)!;
  if (!validateSlots(text, item.slots).ok) return 'invalid';
  if (w.review === 'sent_back') return 'sent_back';
  const r = phraseRecordedState(key, text, clips);
  if (r.stale > 0) return 'stale';
  if (r.total > 0 && r.done === r.total) return w.review === 'reviewed' ? 'reviewed' : 'recorded';
  if (r.done > 0) return 'partial';
  return 'written';
}

export const STATE_LABEL: Record<ItemState, string> = {
  todo: 'Not started',
  invalid: 'Slots need fixing',
  written: 'Written',
  partial: 'Partly recorded',
  stale: 'Wording changed, record again',
  recorded: 'Recorded',
  reviewed: 'Reviewed',
  sent_back: 'Sent back',
};

export interface Totals {
  total: number;
  written: number;
  recorded: number;
  reviewed: number;
}

const order: ItemState[] = ['todo', 'invalid', 'written', 'partial', 'stale', 'sent_back', 'recorded', 'reviewed'];
const rank = (s: ItemState) => order.indexOf(s);

export function totals(p: Project, clips: ReadonlyMap<string, ClipRecord>, section?: Section): Totals {
  const t: Totals = { total: 0, written: 0, recorded: 0, reviewed: 0 };
  for (const i of ITEMS) {
    if (section && i.section !== section) continue;
    t.total += 1;
    const s = itemState(p, clips, i.key);
    if (rank(s) >= rank('written')) t.written += 1;
    if (s === 'recorded' || s === 'reviewed') t.recorded += 1;
    if (s === 'reviewed') t.reviewed += 1;
  }
  return t;
}

export const sectionTotals = (p: Project, clips: ReadonlyMap<string, ClipRecord>) =>
  Object.fromEntries(SECTIONS.map((s) => [s, totals(p, clips, s)])) as Record<Section, Totals>;

export function nextTodo(p: Project, clips: ReadonlyMap<string, ClipRecord>, after?: string): string | undefined {
  const idx = after ? ITEMS.findIndex((i) => i.key === after) : -1;
  const list = [...ITEMS.slice(idx + 1), ...ITEMS.slice(0, idx + 1)];
  return list.find((i) => {
    const s = itemState(p, clips, i.key);
    return s !== 'recorded' && s !== 'reviewed';
  })?.key;
}
