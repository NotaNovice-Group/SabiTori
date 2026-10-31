import { useEffect, useRef, useState } from 'react';
import { FileArchive, Trash2, ArrowRight } from 'lucide-react';
import { db } from '../lib/db';
import { importPackZip } from '../lib/pack';
import { newProject, uid, validateTag, type Project, type Speaker, type ClipRecord } from '../lib/model';
import { knownTags } from '../lib/catalogRef';
import { totals } from '../lib/status';
import { Bar, Btn, Mark } from './bits';
import { FallbackPicker, LicensePicker, SpeakersEditor } from './Forms';

export function Start({ onOpen }: { onOpen: (p: Project, clips: ClipRecord[]) => void }) {
  const [saved, setSaved] = useState<{ p: Project; clips: ClipRecord[] }[] | null>(null);
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [autonym, setAutonym] = useState('');
  const [fallback, setFallback] = useState<string[]>(['fr']);
  const [speakers, setSpeakers] = useState<Speaker[]>([{ id: uid(), name: '', role: 'speaker', consent: false }]);
  const [license, setLicense] = useState('CC-BY-SA-4.0');
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const ps = await db.listProjects();
        const out = await Promise.all(ps.sort((a, b) => b.updatedAt - a.updatedAt).map(async (p) => ({ p, clips: await db.listClips(p.id) })));
        setSaved(out);
      } catch {
        setSaved([]);
      }
    })();
  }, []);

  const tagErr = validateTag(tag);
  const problems = [
    tagErr,
    !name.trim() && 'Write the English name of the language.',
    !autonym.trim() && 'Write what the language is called in itself.',
    !speakers.some((s) => s.name.trim()) && 'Add at least one person.',
  ].filter(Boolean) as string[];

  const create = async () => {
    setTouched(true);
    if (problems.length) return;
    const p = newProject({
      tag, name: name.trim(), autonym: autonym.trim(), fallback: fallback.filter((f) => f !== tag),
      speakers: speakers.filter((s) => s.name.trim()), license,
    });
    await db.putProject(p).catch(() => undefined);
    onOpen(p, []);
  };

  const importZip = async (f: File) => {
    try {
      const { project, clips } = importPackZip(new Uint8Array(await f.arrayBuffer()));
      await db.putProject(project).catch(() => undefined);
      await Promise.all(clips.map((c) => db.putClip(project.id, c).catch(() => undefined)));
      onOpen(project, clips);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We could not read this file.');
    }
  };

  return (
    <main className="start">
      <header className="start-head">
        <span className="brand"><Mark size={30} /> SabiTori Recorder</span>
        <h1>Add your language to SabiTori</h1>
        <p className="lede">
          SabiTori speaks short explanations of official messages to people who cannot read. Write each sentence in your language, then say it aloud. Your work is saved on this device, even without internet.
        </p>
      </header>

      <div className="start-grid">
        <form className="form" onSubmit={(e) => { e.preventDefault(); void create(); }} noValidate>
          <h2>A new language</h2>
          <div className="row2">
            <div className="fieldwrap">
              <label htmlFor="tag">Language code</label>
              <input id="tag" className="field" value={tag} maxLength={3} onChange={(e) => setTag(e.target.value.toLowerCase().trim())} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-describedby="tag-help" placeholder="ewo" />
              <p id="tag-help" className={`help ${touched && tagErr ? 'bad' : ''}`}>
                {touched && tagErr ? tagErr : knownTags.has(tag) ? `${tag} already has a pack. To continue it, open its zip file instead.` : 'Three letters from the ISO 639-3 list, like ewo or fub.'}
              </p>
            </div>
            <div className="fieldwrap">
              <label htmlFor="name">Name in English</label>
              <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ewondo" autoComplete="off" />
            </div>
          </div>
          <div className="fieldwrap">
            <label htmlFor="autonym">Name in your own language</label>
            <input id="autonym" className="field" lang={tag || 'und'} value={autonym} onChange={(e) => setAutonym(e.target.value)} placeholder="Ewondo" autoComplete="off" spellCheck={false} />
            <p className="help">This is what people see when they choose the language.</p>
          </div>
          <div className="fieldwrap">
            <span className="label">If a phrase is missing, SabiTori uses these, in this order</span>
            <FallbackPicker value={fallback} onChange={setFallback} self={tag} />
          </div>

          <h2>Who is working on it</h2>
          <SpeakersEditor speakers={speakers} onChange={setSpeakers} />

          <h2>Licence</h2>
          <LicensePicker value={license} onChange={setLicense} />

          {touched && problems.length > 0 && (
            <ul className="problems" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          <Btn variant="primary" type="submit" className="wide">
            Create language and start <ArrowRight size={22} aria-hidden />
          </Btn>
        </form>

        <aside className="side">
          {saved && saved.length > 0 && (
            <section className="continue" aria-labelledby="cont-h">
              <h2 id="cont-h">Continue where you stopped</h2>
              <ul>
                {saved.map(({ p, clips }) => {
                  const t = totals(p, new Map(clips.map((c) => [c.id, c])));
                  return (
                    <li key={p.id}>
                      <button type="button" className="proj" onClick={() => onOpen(p, clips)}>
                        <span className="proj-name" lang={p.tag}>{p.autonym}</span>
                        <span className="proj-meta">{p.name} · {p.tag} · {t.recorded} of {t.total} recorded</span>
                        <Bar value={t.recorded} total={t.total} label="Recorded" />
                      </button>
                      <button type="button" className="btn btn-plain icon-only" aria-label={`Delete ${p.name} from this device`} onClick={async () => {
                        if (confirm(`Delete ${p.name} from this device? Export a zip first if you want to keep it.`)) {
                          await db.deleteProject(p.id);
                          setSaved((s) => s?.filter((x) => x.p.id !== p.id) ?? null);
                        }
                      }}>
                        <Trash2 size={22} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section className="open" aria-labelledby="imp-h">
            <h2 id="imp-h">Open a pack file</h2>
            <p>Have a pack .zip from a teammate or from an earlier export? Open it and carry on.</p>
            <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={(e) => e.target.files?.[0] && importZip(e.target.files[0])} />
            <Btn icon={FileArchive} onClick={() => file.current?.click()}>Choose a .zip file</Btn>
            {err && <p className="note note-warn" role="alert">{err}</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}
