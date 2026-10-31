import { useEffect, useState } from 'react';
import { BookOpenText, Hash, Headphones, Package, Check, CloudOff } from 'lucide-react';
import type { ClipRecord, Project } from './lib/model';
import { totals } from './lib/status';
import { ProjectProvider, useProject } from './store';
import { Atoms } from './ui/Atoms';
import { Bar, Mark } from './ui/bits';
import { PackPanel } from './ui/PackPanel';
import { Phrases } from './ui/Phrases';
import { Review } from './ui/Review';
import { Start } from './ui/Start';

type View = 'phrases' | 'atoms' | 'review' | 'pack';
const NAV = [
  ['phrases', 'Phrases', BookOpenText],
  ['atoms', 'Numbers', Hash],
  ['review', 'Review', Headphones],
  ['pack', 'Pack', Package],
] as const;

export function App() {
  const [open, setOpen] = useState<{ p: Project; clips: ClipRecord[] } | null>(null);
  if (!open) return <Start onOpen={(p, clips) => setOpen({ p, clips })} />;
  return (
    <ProjectProvider key={open.p.id} initial={open.p} initialClips={open.clips}>
      <Shell onClose={() => setOpen(null)} />
    </ProjectProvider>
  );
}

function Shell({ onClose }: { onClose: () => void }) {
  const { project, clips, saving } = useProject();
  const [view, setView] = useState<View>(() => {
    const h = location.hash.slice(1) as View;
    return NAV.some((n) => n[0] === h) ? h : 'phrases';
  });
  const [selected, setSelected] = useState<string | null>(null);
  const t = totals(project, clips);
  useEffect(() => {
    try { history.replaceState(null, '', `#${view}`); } catch { /* ignore */ }
  }, [view]);

  const go = (v: View) => { setView(v); if (v === 'phrases') setSelected(null); };
  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-id">
          <span className="brand"><Mark size={26} /> SabiTori Recorder</span>
          <p className="lang-name" lang={project.tag}>{project.autonym}</p>
          <p className="lang-meta">{project.name} <span className="tagname">{project.tag}</span></p>
        </div>
        <nav aria-label="Sections" className="nav">
          {NAV.map(([v, label, Icon]) => (
            <button key={v} type="button" className="navbtn" aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>
              <Icon size={24} aria-hidden /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="mini">
            <p><span>Written</span> <span className="num">{t.written}/{t.total}</span></p>
            <Bar value={t.written} total={t.total} tone="ink" label="Written" />
            <p><span>Recorded</span> <span className="num">{t.recorded}/{t.total}</span></p>
            <Bar value={t.recorded} total={t.total} label="Recorded" />
            <p><span>Reviewed</span> <span className="num">{t.reviewed}/{t.total}</span></p>
            <Bar value={t.reviewed} total={t.total} label="Reviewed" />
          </div>
          <p className="saved" role="status" data-state={saving}>
            {saving === 'error' ? <CloudOff size={18} aria-hidden /> : <Check size={18} aria-hidden />}
            {saving === 'saving' ? 'Saving on this device' : saving === 'error' ? 'Could not save here. Export a zip now.' : 'Saved on this device'}
          </p>
        </div>
      </aside>
      <header className="topbar">
        <span className="lang-name" lang={project.tag}>{project.autonym}</span>
        <span className="saved" data-state={saving}><Check size={18} aria-hidden /> {saving === 'saving' ? 'Saving' : 'Saved'}</span>
      </header>
      <main className="stage" data-view={view}>
        {view === 'phrases' && <Phrases selected={selected} setSelected={setSelected} />}
        {view === 'atoms' && <Atoms />}
        {view === 'review' && <Review />}
        {view === 'pack' && <PackPanel onClose={onClose} />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {NAV.map(([v, label, Icon]) => (
          <button key={v} type="button" aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>
            <Icon size={24} aria-hidden /> <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
