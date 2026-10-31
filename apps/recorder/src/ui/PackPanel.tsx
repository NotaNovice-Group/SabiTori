import { useMemo, useState } from 'react';
import { Download, TriangleAlert, CircleCheck } from 'lucide-react';
import { totals } from '../lib/status';
import { exportPackZip } from '../lib/pack';
import { useProject } from '../store';
import { Bar, Btn } from './bits';
import { FallbackPicker, LicensePicker, SpeakersEditor } from './Forms';
import { useAtomIds } from './Atoms';
import { MARK_NAMES } from '../lib/model';

export function PackPanel({ onClose }: { onClose: () => void }) {
  const { project, clips, update } = useProject();
  const t = totals(project, clips);
  const atomIds = useAtomIds();
  const atomsDone = atomIds.filter((id) => clips.has(id)).length;
  const [notes, setNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>('');
  const rulesErr = useMemo(() => {
    if (!project.rulesText?.trim()) return '';
    try {
      JSON.parse(project.rulesText);
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : 'This is not valid JSON.';
    }
  }, [project.rulesText]);

  const doExport = async () => {
    setBusy(true);
    try {
      const atoms = atomIds.filter((id) => clips.has(id));
      const { bytes, version } = await exportPackZip(project, clips, { includeNotes: notes, atomIds: atoms });
      update((p) => ({ ...p, version }));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.tag}-${version}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setDone(`${project.tag}-${version}.zip is in your downloads. Unzip it into packs/${project.tag}/ in the SabiTori project.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page pack" aria-labelledby="pack-h">
      <h1 id="pack-h">Pack for {project.autonym || project.name}</h1>
      <div className="pack-grid">
        <div className="pack-main">
          <section className="block" aria-labelledby="lang-h">
            <h2 id="lang-h">Language</h2>
            <div className="row2">
              <div className="fieldwrap">
                <label htmlFor="p-name">Name in English</label>
                <input id="p-name" className="field" value={project.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="fieldwrap">
                <label htmlFor="p-aut">Name in your own language</label>
                <input id="p-aut" className="field" lang={project.tag} value={project.autonym} onChange={(e) => update((p) => ({ ...p, autonym: e.target.value }))} />
              </div>
            </div>
            <p className="help">Language code <strong className="num">{project.tag}</strong> cannot change once the pack exists.</p>
            <div className="fieldwrap">
              <span className="label">Fallback, in order</span>
              <FallbackPicker value={project.fallback} onChange={(fallback) => update((p) => ({ ...p, fallback }))} self={project.tag} />
            </div>
          </section>
          <section className="block" aria-labelledby="ppl-h">
            <h2 id="ppl-h">People</h2>
            <SpeakersEditor speakers={project.speakers} onChange={(speakers) => update((p) => ({ ...p, speakers, activeSpeakerId: speakers.some((s) => s.id === p.activeSpeakerId) ? p.activeSpeakerId : speakers[0]?.id }))} />
          </section>
          <section className="block" aria-labelledby="lic-h">
            <h2 id="lic-h">Licence</h2>
            <LicensePicker value={project.license} onChange={(license) => update((p) => ({ ...p, license }))} />
          </section>
          <section className="block" aria-labelledby="rules-h">
            <h2 id="rules-h">Number and date rules</h2>
            <p className="help">Advanced. A maintainer can paste rules.json here, so the Numbers page lists the words to record. It is saved in the pack only when you fill it in.</p>
            <label className="sr" htmlFor="rules">rules.json</label>
            <textarea id="rules" className="field code" rows={6} spellCheck={false} value={project.rulesText ?? ''} placeholder='{ "formatVersion": 1 }' onChange={(e) => update((p) => ({ ...p, rulesText: e.target.value || undefined }))} />
            {rulesErr && <p className="note note-warn" role="alert"><TriangleAlert size={20} aria-hidden /> {rulesErr}. It will not be exported until fixed.</p>}
          </section>
          <section className="block" aria-labelledby="pal-h">
            <h2 id="pal-h">Letters</h2>
            <p className="help">Shown under every text field: {project.palette.map((c) => (MARK_NAMES[c] ? MARK_NAMES[c] : c)).join(' ')}. Change them with Edit letters when you write a phrase.</p>
          </section>
        </div>

        <aside className="export" aria-labelledby="exp-h">
          <h2 id="exp-h">Export</h2>
          <dl className="tally">
            {([['Written', t.written, t.total], ['Recorded', t.recorded, t.total], ['Reviewed', t.reviewed, t.total]] as const).map(([k, v, n]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd><span className="num">{v}</span> of <span className="num">{n}</span></dd>
                <Bar value={v} total={n} label={k} />
              </div>
            ))}
            {atomIds.length > 0 && (
              <div>
                <dt>Numbers and dates</dt>
                <dd><span className="num">{atomsDone}</span> of <span className="num">{atomIds.length}</span></dd>
                <Bar value={atomsDone} total={atomIds.length} label="Atom clips" />
              </div>
            )}
          </dl>
          <fieldset className="statuses">
            <legend>Pack status</legend>
            {([['in_recording', 'Still being recorded', 'Not offered to users yet.'], ['beta', 'Ready to try', 'Usable; missing phrases fall back to another language.']] as const).map(([v, title, text]) => (
              <label key={v} className="license" data-on={project.exportStatus === v}>
                <input type="radio" name="status" checked={project.exportStatus === v} onChange={() => update((p) => ({ ...p, exportStatus: v }))} />
                <span className="license-title">{title}</span>
                <span className="license-text">{text}</span>
              </label>
            ))}
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
            <span>Include working notes (consent, review notes, letters) so this zip can be opened here again. Remove before publishing if you prefer.</span>
          </label>
          <Btn variant="primary" icon={Download} className="wide" onClick={doExport} disabled={busy || t.written === 0}>
            {busy ? 'Preparing' : 'Download pack .zip'}
          </Btn>
          {t.written === 0 && <p className="help">Write at least one phrase first.</p>}
          {done && <p className="note note-ok" role="status"><CircleCheck size={20} aria-hidden /> {done}</p>}
          <Btn variant="plain" onClick={onClose} className="wide">Switch language or open a file</Btn>
        </aside>
      </div>
    </section>
  );
}
