import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleCheck, TriangleAlert, Plus, Undo2 } from 'lucide-react';
import { ITEM_BY_KEY, ITEMS, SECTION_LABEL } from '../lib/model';
import { frenchFor } from '../lib/catalogRef';
import { splitAtSlots, validateSlots, slotsIn, tokens } from '../lib/slots';
import { itemState, STATE_LABEL } from '../lib/status';
import { useProject } from '../store';
import { Btn, SlotChip } from './bits';
import { CharPalette, insertAtCaret } from './CharPalette';
import { ClipControls } from './ClipRow';
import { useRecorder } from './useRecorder';

export function Work({ itemKey, onSelect, onBack }: { itemKey: string; onSelect: (k: string) => void; onBack: () => void }) {
  const { project, clips, setPhrase, update, unsaved } = useProject();
  const item = ITEM_BY_KEY.get(itemKey)!;
  const idx = ITEMS.findIndex((i) => i.key === itemKey);
  const w = project.phrases[itemKey];
  const text = w?.text ?? '';
  const ta = useRef<HTMLTextAreaElement>(null);
  const rec = useRecorder();
  const check = useMemo(() => validateSlots(text, item.slots), [text, item.slots]);
  const pieces = useMemo(() => splitAtSlots(itemKey, text), [itemKey, text]);
  const textPieceIds = pieces.filter((p) => p.kind === 'text').map((p) => (p as { id: string }).id);
  const [active, setActive] = useState(0);
  const french = frenchFor(itemKey);
  const state = itemState(project, clips, itemKey);
  const canRecord = text.trim().length > 0 && check.ok && textPieceIds.length > 0;
  const missing = item.slots.filter((s) => !slotsIn(text).includes(s));

  useEffect(() => setActive(0), [itemKey]);

  const pieceText = (id: string) => (pieces.find((p) => p.kind === 'text' && p.id === id) as { text: string } | undefined)?.text ?? '';
  const activeId = textPieceIds[Math.min(active, textPieceIds.length - 1)];

  // Keyboard on laptop: R record/stop, Space play, Enter next, Shift+Enter previous.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = !!t.closest('button, a');
      if (e.key === 'r' || e.key === 'R') {
        if (canRecord && activeId) {
          e.preventDefault();
          rec.toggle(activeId, pieceText(activeId), itemKey);
        }
      } else if (e.key === ' ' && !onButton) {
        if (activeId && clips.has(activeId)) {
          e.preventDefault();
          void rec.play(activeId);
        }
      } else if (e.key === 'Enter' && !onButton) {
        e.preventDefault();
        const j = Math.max(0, Math.min(ITEMS.length - 1, idx + (e.shiftKey ? -1 : 1)));
        if (ITEMS[j]) onSelect(ITEMS[j]!.key);
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  // After a clip is saved, move to the next piece that has no clip.
  const wasSaving = useRef<string | null>(null);
  useEffect(() => {
    if (wasSaving.current && !rec.st.saving) {
      const i = textPieceIds.findIndex((id) => !clips.has(id));
      if (i >= 0) setActive(i);
    }
    wasSaving.current = rec.st.saving;
  }, [rec.st.saving]); // eslint-disable-line react-hooks/exhaustive-deps

  // New wording: any earlier review no longer applies to it.
  const setText = (t: string) => setPhrase(itemKey, (x) => ({ ...x, text: t, ...(x.review === 'reviewed' ? { review: 'none' as const, reviewedBy: undefined } : {}) }));
  const insertSlot = (s: string) => ta.current && insertAtCaret(ta.current, `{${s}}`);

  let pieceNo = -1;
  return (
    <article className="work" aria-labelledby="work-title">
      <header className="work-head">
        <Btn variant="plain" icon={ArrowLeft} onClick={onBack} className="only-phone">
          All phrases
        </Btn>
        <p className="where">
          {SECTION_LABEL[item.section]} <span className="sep" aria-hidden>·</span> <span className="num">{idx + 1} of {ITEMS.length}</span>
          <span className="state" data-state={state}>{STATE_LABEL[state]}</span>
        </p>
        <h2 id="work-title" className="source">
          {tokens(item.en).map((t, i) => (t.t === 'slot' ? <SlotChip key={i} name={t.v} /> : <span key={i}>{t.v}</span>))}
        </h2>
        <p className="context">{item.context}</p>
        {french && (
          <p className="french">
            <span className="french-lang" lang="en">French</span>
            <span lang="fr">{french}</span>
          </p>
        )}
      </header>

      <section className="step" aria-labelledby="write-h">
        <h3 id="write-h">Write it in {project.name || 'your language'}</h3>
        <textarea
          ref={ta}
          className="field big"
          lang={project.tag}
          spellCheck={false}
          autoCapitalize="off"
          rows={3}
          value={text}
          placeholder={`Type the sentence in ${project.autonym || project.name}`}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => e.target.value !== e.target.value.normalize('NFC') && setText(e.target.value.normalize('NFC'))}
          aria-describedby="slot-status"
        />
        <CharPalette palette={project.palette} onChange={(palette) => update((p) => ({ ...p, palette }))} target={ta} />
        {item.slots.length > 0 && (
          <div className="slotbar">
            <span className="slotbar-label">This sentence has {item.slots.length === 1 ? 'a slot' : 'slots'} that SabiTori fills in:</span>
            {item.slots.map((s) => {
              const used = slotsIn(text).includes(s);
              return used ? (
                <span key={s} className="chip chip-ok"><CircleCheck size={16} aria-hidden /> {`{${s}}`}</span>
              ) : (
                <button key={s} type="button" className="chip chip-add" onClick={() => insertSlot(s)}>
                  <Plus size={16} aria-hidden /> {`{${s}}`}
                </button>
              );
            })}
          </div>
        )}
        <p id="slot-status" className={`note ${text.trim() && !check.ok ? 'note-warn' : 'note-quiet'}`} role="status">
          {text.trim() && !check.ok ? <TriangleAlert size={20} aria-hidden /> : null}
          {!text.trim()
            ? 'Write the whole sentence, as you would say it.'
            : check.malformed
              ? 'A curly bracket is broken. A slot looks like {date}.'
              : check.extra.length
                ? `${check.extra.map((s) => `{${s}}`).join(', ')} is not in the English sentence. Remove it.`
                : missing.length
                  ? `Add ${missing.map((s) => `{${s}}`).join(', ')} where it belongs in your sentence.`
                  : item.slots.length
                    ? 'The slots match the English.'
                    : 'Good.'}
        </p>
      </section>

      <section className="step" aria-labelledby="say-h">
        <h3 id="say-h">Say it aloud</h3>
        {!canRecord ? (
          <p className="note note-quiet">Finish writing the sentence first. Each part is recorded separately.</p>
        ) : (
          <>
            {pieces.length > 1 && (
              <p className="hint">The sentence is cut at its {item.slots.length === 1 ? 'slot' : 'slots'}. Record each part on its own.</p>
            )}
            <ol className="pieces">
              {pieces.map((p, i) => {
                if (p.kind === 'slot') {
                  return (
                    <li key={i} className="slotrow">
                      <SlotChip name={p.name} dashed />
                      <span>SabiTori says this part by itself, from the number and date clips.</span>
                    </li>
                  );
                }
                pieceNo += 1;
                const n = pieceNo;
                const clip = clips.get(p.id);
                const stale = !!clip && clip.text !== p.text;
                return (
                  <li key={p.id} className="piece" data-active={n === active} data-state={clip ? (stale ? 'stale' : 'done') : 'empty'} onClick={() => setActive(n)}>
                    <p className="piece-text" lang={project.tag}>{p.text}</p>
                    <p className="piece-state">{clip ? (stale ? 'The words changed. Record this part again.' : unsaved.has(p.id) ? 'Recorded, not saved on this device' : 'Recorded') : 'Not recorded'}</p>
                    <ClipControls
                      id={p.id}
                      clip={clip}
                      stale={stale}
                      unsaved={unsaved.has(p.id)}
                      st={rec.st}
                      label={pieces.length > 1 ? `part ${n + 1}` : undefined}
                      onToggle={() => { setActive(n); rec.toggle(p.id, p.text, itemKey); }}
                      onPlay={() => { setActive(n); void rec.play(p.id); }}
                    />
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      {w?.review === 'sent_back' && (
        <p className="note note-warn sentback">
          <Undo2 size={20} aria-hidden /> Sent back by a reviewer{w.note ? `: ${w.note}` : '.'} Fix it, then record again if needed.
        </p>
      )}

      <footer className="work-foot">
        <Btn icon={ArrowLeft} onClick={() => onSelect(ITEMS[Math.max(0, idx - 1)]!.key)} disabled={idx === 0}>
          Previous
        </Btn>
        <Btn variant="primary" onClick={() => onSelect(ITEMS[Math.min(ITEMS.length - 1, idx + 1)]!.key)} disabled={idx === ITEMS.length - 1}>
          Next phrase <ArrowRight size={22} aria-hidden />
        </Btn>
        <p className="keys only-desktop" aria-label="Keyboard shortcuts">
          <kbd>R</kbd> record or stop <kbd>Space</kbd> play <kbd>Enter</kbd> next <kbd>Shift</kbd>+<kbd>Enter</kbd> previous
        </p>
      </footer>
    </article>
  );
}
