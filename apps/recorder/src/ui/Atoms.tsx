import { useMemo, useRef } from 'react';
import { CheckCheck } from 'lucide-react';
import { toLanguagePack } from '../lib/pack';
import { requiredAtomIds } from '../lib/speechBridge';
import { isPhraseClip } from '../lib/pack';
import { useProject } from '../store';
import { Bar, Btn } from './bits';
import { englishRules } from '../lib/catalogRef';
import { labelOf, parseRules, withLabel } from '../lib/rulesLabels';
import { CharPalette } from './CharPalette';
import { ClipControls } from './ClipRow';
import { useRecorder } from './useRecorder';

const englishHint = (id: string) => labelOf(englishRules, id);
const NAMES: Record<string, string> = { num: 'Numbers', scale: 'Hundreds, thousands, millions', join: 'Joining words', word: 'Small words', currency: 'Money', month: 'Months', weekday: 'Days of the week', day: 'Days of the month', rel: 'Today and tomorrow' };
const human = (s: string) => NAMES[s] ?? s.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function useAtomIds() {
  const { project, clips } = useProject();
  return useMemo(
    () => requiredAtomIds(toLanguagePack(project, clips)).filter((id) => !isPhraseClip(id)),
    [project.rulesText, project.tag, project.phrases, clips], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

export function Atoms() {
  const { project, clips, update } = useProject();
  const ids = useAtomIds();
  const rec = useRecorder();
  const last = useRef<HTMLInputElement | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const id of ids) {
      const g = id.split(/[._:]/)[0] ?? id;
      m.set(g, [...(m.get(g) ?? []), id]);
    }
    const rank = (g: string) => { const i = ['num', 'scale', 'join', 'word', 'currency', 'month', 'weekday', 'day', 'rel'].indexOf(g); return i < 0 ? 99 : i; };
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [ids]);
  const done = ids.filter((id) => clips.has(id)).length;

  return (
    <section className="page" aria-labelledby="atoms-h">
      <h1 id="atoms-h">Numbers, dates and money</h1>
      <p className="lede">
        SabiTori builds numbers, dates and amounts from short clips. For each one, write the word the way you say it in {project.name || 'your language'}, then record it.
      </p>
      {ids.length === 0 ? (
        <div className="empty">
          <h2>Nothing to record here yet</h2>
          <p>The list of words comes from the pack&apos;s number and date rules. Start from the English rules: the same words are listed, and you write each one in {project.name || 'your language'} as you record it. Numbers that work differently in your language can be adjusted later under Pack.</p>
          {englishRules && (
            <Btn variant="primary" onClick={() => update((p) => ({ ...p, rulesText: JSON.stringify(englishRules, null, 2) }))}>
              Start from the English rules
            </Btn>
          )}
        </div>
      ) : (
        <>
          <div className="atoms-sum">
            <p><span className="num big">{done}</span> of <span className="num">{ids.length}</span> recorded</p>
            <Bar value={done} total={ids.length} label="Atom clips recorded" />
          </div>
          <div className="atoms-palette">
            <CharPalette palette={project.palette} onChange={(palette) => update((p) => ({ ...p, palette }))} target={last} />
          </div>
          {groups.map(([g, list]) => (
            <section key={g} className="atom-group">
              <h2>{human(g)}</h2>
              <ul className="atoms">
                {list.map((id) => {
                  const clip = clips.get(id);
                  const label = project.atoms[id]?.label ?? '';
                  const stale = !!clip && clip.text !== label.trim();
                  return (
                    <li key={id} className="atom" data-done={!!clip && !stale}>
                      <div className="fieldwrap">
                        <label htmlFor={`a-${id}`}><span className="atom-id">{id}</span></label>
                        <input
                          id={`a-${id}`}
                          className="field"
                          lang={project.tag}
                          spellCheck={false}
                          value={label}
                          placeholder={englishHint(id) ? `English: ${englishHint(id)}` : 'Write the word'}
                          onFocus={(e) => (last.current = e.currentTarget)}
                          onChange={(e) => {
                            const v = e.target.value;
                            update((p) => {
                              const r = parseRules(p.rulesText);
                              return { ...p, atoms: { ...p.atoms, [id]: { label: v } }, ...(r ? { rulesText: JSON.stringify(withLabel(r, id, v.trim() || (labelOf(englishRules, id) ?? v)), null, 2) } : {}) };
                            });
                          }}
                        />
                      </div>
                      <ClipControls
                        id={id}
                        clip={clip}
                        stale={stale}
                        st={rec.st}
                        label={label || id}
                        onToggle={() => label.trim() && rec.toggle(id, label.trim())}
                        onPlay={() => void rec.play(id)}
                      />
                      {!label.trim() && <p className="help">Write the word first.</p>}
                      {stale && <p className="help bad">The word changed after recording. Record it again.</p>}
                      {clip && !stale && <p className="help ok"><CheckCheck size={18} aria-hidden /> Recorded</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
