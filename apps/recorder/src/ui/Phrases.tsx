import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Circle, PenLine, Mic, CheckCheck, Undo2, TriangleAlert, ShieldAlert, Building2, FileText, Hand, CalendarClock, Banknote, Phone, Info, ListChecks, Smartphone, type LucideIcon } from 'lucide-react';
import { ITEMS, SECTIONS, SECTION_LABEL, type Section } from '../lib/model';
import { itemState, sectionTotals, STATE_LABEL, nextTodo, type ItemState } from '../lib/status';
import { useProject } from '../store';
import { Bar, useMedia } from './bits';
import { Work } from './Work';

const SECTION_ICON: Record<Section, LucideIcon> = {
  scam: ShieldAlert, sender: Building2, about: FileText, action: Hand, deadline: CalendarClock,
  money: Banknote, help: Phone, urgency: Info, facts_only: ListChecks, ui: Smartphone,
};
const STATE_ICON: Record<ItemState, LucideIcon> = {
  todo: Circle, invalid: TriangleAlert, written: PenLine, partial: Mic, stale: TriangleAlert, recorded: Mic, reviewed: CheckCheck, sent_back: Undo2,
};

export function Phrases({ selected, setSelected }: { selected: string | null; setSelected: (k: string | null) => void }) {
  const { project, clips } = useProject();
  const wide = useMedia('(min-width: 960px)');
  const totals = sectionTotals(project, clips);
  const [open, setOpen] = useState<Set<Section>>(new Set());

  useEffect(() => {
    if (wide && !selected) setSelected(nextTodo(project, clips) ?? ITEMS[0]!.key);
  }, [wide]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) return;
    const sec = selected.split('.')[0] as Section;
    setOpen((o) => (o.has(sec) ? o : new Set(o).add(sec)));
  }, [selected]);

  const toggle = (s: Section) => setOpen((o) => {
    const n = new Set(o);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });

  const showQueue = wide || !selected;
  const showWork = wide || !!selected;
  return (
    <div className="phrases">
      {showQueue && (
        <nav className="queue" aria-label="Phrases to translate">
          <h2 className="queue-title">Phrases</h2>
          {SECTIONS.map((s) => {
            const t = totals[s];
            const Icon = SECTION_ICON[s];
            const isOpen = open.has(s);
            const done = t.recorded === t.total;
            return (
              <section key={s} className="group">
                <button type="button" className="group-head" data-section={s} onClick={() => toggle(s)} aria-expanded={isOpen}>
                  <Icon size={26} aria-hidden />
                  <span className="group-name">{SECTION_LABEL[s]}</span>
                  <span className="group-count num">{done ? 'All recorded' : `${t.recorded} of ${t.total}`}</span>
                  {isOpen ? <ChevronDown size={22} aria-hidden /> : <ChevronRight size={22} aria-hidden />}
                  <Bar value={t.recorded} total={t.total} label={`${SECTION_LABEL[s]}: recorded`} />
                </button>
                {isOpen && (
                  <ul className="items">
                    {ITEMS.filter((i) => i.section === s).map((i) => {
                      const st = itemState(project, clips, i.key);
                      const SI = STATE_ICON[st];
                      return (
                        <li key={i.key}>
                          <button type="button" className="item" data-key={i.key} data-state={st} aria-current={selected === i.key ? 'true' : undefined} onClick={() => setSelected(i.key)}>
                            <SI size={22} aria-hidden />
                            <span className="item-en">{i.en}</span>
                            <span className="sr">{STATE_LABEL[st]}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </nav>
      )}
      {showWork && selected && <Work key="work" itemKey={selected} onSelect={setSelected} onBack={() => setSelected(null)} />}
    </div>
  );
}
