import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, CheckCheck, Undo2, Info } from 'lucide-react';
import { ITEMS, type CatalogItem } from '../lib/model';
import { splitAtSlots, tokens } from '../lib/slots';
import { itemState } from '../lib/status';
import { canReview, recordersOf, toLanguagePack } from '../lib/pack';
import { EXAMPLE_SLOTS, renderWithSlots, type Playable } from '../lib/speechBridge';
import { playUrl, stopPlayback } from '../lib/audio';
import { useProject } from '../store';
import { Btn, SlotChip } from './bits';

type Filter = 'todo' | 'sent_back' | 'reviewed';

export function Review() {
  const { project, clips, setPhrase, urlFor } = useProject();
  const [filter, setFilter] = useState<Filter>('todo');
  const [playing, setPlaying] = useState<{ key: string; index: number } | null>(null);
  const [also, setAlso] = useState<Record<string, string>>({});
  const run = useRef(0);
  const speaker = project.speakers.find((s) => s.id === project.activeSpeakerId);

  useEffect(() => () => { run.current++; stopPlayback(); }, []);

  const rows = useMemo(
    () =>
      ITEMS.map((i) => ({ i, st: itemState(project, clips, i.key) })).filter(({ st }) => st === 'recorded' || st === 'reviewed' || st === 'sent_back'),
    [project, clips],
  );
  const counts = {
    todo: rows.filter((r) => r.st === 'recorded').length,
    sent_back: rows.filter((r) => r.st === 'sent_back').length,
    reviewed: rows.filter((r) => r.st === 'reviewed').length,
  };
  const shown = rows.filter((r) => (filter === 'todo' ? r.st === 'recorded' : r.st === filter));

  const playAll = async (item: CatalogItem) => {
    if (playing?.key === item.key) {
      run.current++;
      stopPlayback();
      setPlaying(null);
      return;
    }
    const me = ++run.current;
    const text = project.phrases[item.key]!.text;
    // Prefer the real speech renderer (slots filled with example values); else just the pieces.
    const rendered = await renderWithSlots(item.key, toLanguagePack(project, clips), (id) => urlFor(id) ?? '', (id) => clips.has(id), [...item.slots]);
    const plan: Playable[] =
      rendered && rendered.parts.length
        ? rendered.parts
        : splitAtSlots(item.key, text).flatMap((p) => (p.kind === 'text' && urlFor(p.id) ? [{ kind: 'clip' as const, url: urlFor(p.id)! }] : []));
    if (rendered) setAlso((a) => ({ ...a, [item.key]: rendered.text }));
    for (let n = 0; n < plan.length; n++) {
      if (run.current !== me) return;
      setPlaying({ key: item.key, index: n });
      const part = plan[n]!;
      if (part.kind === 'clip') await playUrl(part.url);
      else await speakTts(part.text);
    }
    if (run.current === me) setPlaying(null);
  };

  return (
    <section className="page" aria-labelledby="rev-h">
      <h1 id="rev-h">Review</h1>
      <p className="lede">A second speaker listens to each phrase as SabiTori will say it. Mark it reviewed, or send it back with a note.</p>
      <p className="label">Listening now</p>
      <ReviewerPicker />
      <div className="seg" role="tablist" aria-label="Show">
        {([['todo', 'To review'], ['sent_back', 'Sent back'], ['reviewed', 'Reviewed']] as const).map(([f, label]) => (
          <button key={f} role="tab" type="button" aria-selected={filter === f} onClick={() => setFilter(f)}>
            {label} <span className="num">{counts[f]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <h2>{filter === 'todo' ? 'Nothing waiting for review' : filter === 'sent_back' ? 'Nothing sent back' : 'Nothing reviewed yet'}</h2>
          <p>{filter === 'todo' ? 'Phrases appear here once every part of them is recorded.' : 'They will show up here.'}</p>
        </div>
      ) : (
        <ul className="reviews">
          {shown.map(({ i, st }) => {
            const w = project.phrases[i.key]!;
            // The reviewer must not have recorded ANY part of the phrase (not only the last recording).
            const verdict = canReview(project, clips, i.key, speaker?.id);
            const own = !!speaker && recordersOf(project, clips, i.key).has(speaker.id);
            const isPlaying = playing?.key === i.key;
            return (
              <li key={i.key} className="review">
                <p className="review-key">{i.key}</p>
                <p className="review-en">{tokens(i.en).map((t, n) => t.t === 'slot' ? <SlotChip key={n} name={t.v} /> : <span key={n}>{t.v}</span>)}</p>
                <p className="review-text" lang={project.tag}>{tokens(w.text).map((t, n) => t.t === 'slot' ? <SlotChip key={n} name={t.v} dashed /> : <span key={n}>{t.v}</span>)}</p>
                <div className="strip" aria-hidden>
                  {splitAtSlots(i.key, w.text).map((p, n) => (
                    <span key={n} className={p.kind === 'slot' ? 'seg-slot' : 'seg-clip'} data-on={isPlaying && playing?.index === n}>
                      {p.kind === 'slot' ? `{${p.name}}` : `${((clips.get(p.id)?.durationMs ?? 0) / 1000).toFixed(1)} s`}
                    </span>
                  ))}
                </div>
                {i.slots.length > 0 && (
                  <p className="example">
                    <Info size={18} aria-hidden /> Heard with {i.slots.map((s) => `${s} = ${EXAMPLE_SLOTS[s]?.shown ?? '…'}`).join(', ')}
                    {also[i.key] ? '' : '. Slot words play once the number and date clips are recorded.'}
                  </p>
                )}
                <div className="review-actions">
                  <Btn variant="quiet" icon={isPlaying ? Pause : Play} onClick={() => void playAll(i)}>{isPlaying ? 'Stop' : 'Play whole sentence'}</Btn>
                </div>
                <label className="fieldwrap" htmlFor={`n-${i.key}`}>
                  <span className="label">Note for the speaker</span>
                  <input id={`n-${i.key}`} className="field" value={w.note ?? ''} placeholder="For example: the last word is too fast" onChange={(e) => setPhrase(i.key, (x) => ({ ...x, note: e.target.value }))} />
                </label>
                {own && st !== 'reviewed' && (
                  <p className="note note-quiet"><Info size={20} aria-hidden /> {speaker?.name} recorded this. Choose a different reviewer above.</p>
                )}
                {w.importedReviewed && st !== 'reviewed' && (
                  <p className="note note-quiet"><Info size={20} aria-hidden /> The imported pack said this was reviewed, but not by whom. Listen again and mark it reviewed here.</p>
                )}
                <div className="review-actions">
                  <Btn variant="primary" icon={CheckCheck} disabled={!verdict.ok || st === 'reviewed'} onClick={() => verdict.ok && setPhrase(i.key, (x) => ({ ...x, review: 'reviewed', reviewedBy: speaker?.id }))}>
                    {st === 'reviewed' ? 'Reviewed' : 'Mark as reviewed'}
                  </Btn>
                  <Btn icon={Undo2} disabled={!speaker || st === 'sent_back' || !(w.note ?? '').trim()} onClick={() => setPhrase(i.key, (x) => ({ ...x, review: 'sent_back' }))}>
                    Send back
                  </Btn>
                  {st === 'sent_back' && <span className="help">Waiting for the speaker to fix it.</span>}
                  {!(w.note ?? '').trim() && st !== 'sent_back' && <span className="help">Write a note to send it back.</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ReviewerPicker() {
  const { project, update } = useProject();
  return (
    <div className="reviewer-pick" role="radiogroup" aria-label="Who is listening now">
      {project.speakers.map((s) => (
        <label key={s.id} className="pick" data-on={project.activeSpeakerId === s.id}>
          <input type="radio" name="who" checked={project.activeSpeakerId === s.id} onChange={() => update((p) => ({ ...p, activeSpeakerId: s.id }))} />
          {s.name || 'Unnamed'}
        </label>
      ))}
    </div>
  );
}

function speakTts(text: string): Promise<void> {
  return new Promise((res) => {
    if (!('speechSynthesis' in window)) return res();
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => res();
    u.onerror = () => res();
    speechSynthesis.speak(u);
  });
}

