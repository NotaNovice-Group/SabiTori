import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { LICENSES, uid, type Speaker } from '../lib/model';
import { knownPacks } from '../lib/catalogRef';

export function SpeakersEditor({ speakers, onChange }: { speakers: Speaker[]; onChange: (s: Speaker[]) => void }) {
  const set = (id: string, patch: Partial<Speaker>) => onChange(speakers.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <div className="people">
      {speakers.map((s, i) => (
        <div key={s.id} className="person">
          <div className="person-top">
            <div className="fieldwrap grow">
              <label htmlFor={`sp-${s.id}`}>Name shown to the public</label>
              <input id={`sp-${s.id}`} className="field" value={s.name} onChange={(e) => set(s.id, { name: e.target.value })} placeholder={i === 0 ? 'For example: Marie N.' : 'Name'} autoComplete="off" />
            </div>
            <div className="fieldwrap">
              <label htmlFor={`rl-${s.id}`}>Role</label>
              <select id={`rl-${s.id}`} className="field" value={s.role} onChange={(e) => set(s.id, { role: e.target.value as Speaker['role'] })}>
                <option value="speaker">Voice</option>
                <option value="translator">Translator</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>
            {speakers.length > 1 && (
              <button type="button" className="btn btn-plain icon-only" onClick={() => onChange(speakers.filter((x) => x.id !== s.id))} aria-label={`Remove ${s.name || 'this person'}`}>
                <X size={22} aria-hidden />
              </button>
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={s.consent} onChange={(e) => set(s.id, { consent: e.target.checked })} />
            <span>{s.name.trim() || 'This person'} agrees to be named as a contributor. Without a tick, the name stays in this project and is not published.</span>
          </label>
        </div>
      ))}
      <button type="button" className="btn btn-quiet" onClick={() => onChange([...speakers, { id: uid(), name: '', role: 'speaker', consent: false }])}>
        <Plus size={22} aria-hidden /> Add a person
      </button>
    </div>
  );
}

export function LicensePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="licenses">
      <legend>Who may use this language pack?</legend>
      {LICENSES.map((l) => (
        <label key={l.id} className="license" data-on={value === l.id}>
          <input type="radio" name="license" value={l.id} checked={value === l.id} onChange={() => onChange(l.id)} />
          <span className="license-title">{l.title}</span>
          <span className="license-text">{l.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function FallbackPicker({ value, onChange, self }: { value: string[]; onChange: (v: string[]) => void; self: string }) {
  const [extra, setExtra] = useState('');
  const base = [...new Set(['fr', 'en', ...knownPacks.map((m) => m.tag)])].filter((t) => t !== self);
  const options = [...new Set([...base, ...value])];
  const nameOf = (t: string) => knownPacks.find((m) => m.tag === t)?.name ?? t;
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  return (
    <div>
      <div className="chips-pick" role="group" aria-label="Fallback languages">
        {options.map((t) => (
          <label key={t} className="pick" data-on={value.includes(t)}>
            <input type="checkbox" checked={value.includes(t)} onChange={() => toggle(t)} />
            {nameOf(t)} <span className="tagname">{t}</span>
            {value.includes(t) && <span className="order num">{value.indexOf(t) + 1}</span>}
          </label>
        ))}
      </div>
      <div className="inline-add">
        <input className="field" aria-label="Another language code" value={extra} onChange={(e) => setExtra(e.target.value.toLowerCase())} placeholder="Another code, like dua" maxLength={3} />
        <button type="button" className="btn btn-quiet" disabled={!/^[a-z]{2,3}$/.test(extra) || value.includes(extra)} onClick={() => { onChange([...value, extra]); setExtra(''); }}>
          Add
        </button>
      </div>
    </div>
  );
}
