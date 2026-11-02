import { useMemo, useRef, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { toLanguagePack } from '../lib/pack';
import { requiredAtomIds } from '../lib/speechBridge';
import { isPhraseClip } from '../lib/pack';
import { useProject } from '../store';
import { Bar, Btn } from './bits';
import { englishRules } from '../lib/catalogRef';
import { DEFAULT_ANSWERS, neutralRules, type StarterAnswers } from '../lib/starter';
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
  const { project, clips, update, unsaved } = useProject();
  const ids = useAtomIds();
  const [answers, setAnswers] = useState<StarterAnswers>(DEFAULT_ANSWERS);
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
          <p>The list of words comes from the pack&apos;s number and date rules. Answer a few questions about how {project.name || 'your language'} says dates, years and money. You then write and record each word yourself; nothing is copied from English.</p>
          <StarterQuestions answers={answers} onChange={setAnswers} />
          <Btn variant="primary" onClick={() => update((p) => ({ ...p, rulesText: JSON.stringify(neutralRules(answers), null, 2) }))}>
            Make the list of words
          </Btn>
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
                              return { ...p, atoms: { ...p.atoms, [id]: { label: v } }, ...(r ? { rulesText: JSON.stringify(withLabel(r, id, v.trim() || (labelOf(r, id) ?? v)), null, 2) } : {}) };
                            });
                          }}
                        />
                      </div>
                      <ClipControls
                        id={id}
                        clip={clip}
                        stale={stale}
                        unsaved={unsaved.has(id)}
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

function Choice<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="licenses">
      <legend>{legend}</legend>
      {options.map(([v, label]) => (
        <label key={v} className="license" data-on={value === v}>
          <input type="radio" name={legend} checked={value === v} onChange={() => onChange(v)} />
          <span className="license-title">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A few questions that shape the rules without assuming English: how years, dates and money are said. */
function StarterQuestions({ answers: a, onChange }: { answers: StarterAnswers; onChange: (a: StarterAnswers) => void }) {
  return (
    <div className="starter">
      <Choice legend="How do you say a year, like 2027?" value={a.yearStyle} onChange={(yearStyle) => onChange({ ...a, yearStyle })} options={[['cardinal', 'As one number (two thousand and twenty-seven)'], ['century_pairs', 'In two parts (twenty, twenty-seven)']]} />
      <Choice legend="In a date, which comes first?" value={a.dateOrder} onChange={(dateOrder) => onChange({ ...a, dateOrder })} options={[['day_month', 'The day, then the month'], ['month_day', 'The month, then the day']]} />
      <Choice legend="How do you say the day of the month?" value={a.dayWords} onChange={(dayWords) => onChange({ ...a, dayWords })} options={[['numbers', 'With the ordinary numbers'], ['own_words', 'With special words for each day (like first, second)']]} />
      <Choice legend="Where does the money word go?" value={a.moneyOrder} onChange={(moneyOrder) => onChange({ ...a, moneyOrder })} options={[['amount_first', 'After the amount'], ['currency_first', 'Before the amount']]} />
      <Choice legend="Is there a word that joins the parts of a number?" value={a.joiner ? 'yes' : 'no'} onChange={(v) => onChange({ ...a, joiner: v === 'yes' })} options={[['no', 'No'], ['yes', 'Yes (like “and” in a hundred and five)']]} />
      <fieldset className="licenses">
        <legend>Do the number words change when you count...</legend>
        {([['money', 'money'], ['day', 'days of the month'], ['year', 'years']] as const).map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={a.ownWords[k]} onChange={(e) => onChange({ ...a, ownWords: { ...a.ownWords, [k]: e.target.checked } })} />
            <span>{label}: they have their own words</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
