import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from './lib/db';
import type { ClipRecord, PhraseWork, Project } from './lib/model';

interface Ctx {
  project: Project;
  clips: ReadonlyMap<string, ClipRecord>;
  saving: 'saved' | 'saving' | 'error';
  update: (f: (p: Project) => Project) => void;
  setPhrase: (key: string, f: (w: PhraseWork) => PhraseWork) => void;
  putClip: (c: ClipRecord) => Promise<void>;
  removeClip: (id: string) => Promise<void>;
  urlFor: (id: string) => string | undefined;
}

const C = createContext<Ctx | null>(null);
export const useProject = () => {
  const c = useContext(C);
  if (!c) throw new Error('no project');
  return c;
};

export function ProjectProvider({ initial, initialClips, children }: { initial: Project; initialClips: ClipRecord[]; children: ReactNode }) {
  const [project, setProject] = useState(initial);
  const [clips, setClips] = useState(() => new Map(initialClips.map((c) => [c.id, c])));
  const [saving, setSaving] = useState<Ctx['saving']>('saved');
  const urls = useRef(new Map<string, { blob: Blob; url: string }>());
  const timer = useRef<number>(0);
  const latest = useRef(project);
  latest.current = project;

  const flush = useCallback(async () => {
    try {
      await db.putProject(latest.current);
      setSaving('saved');
    } catch {
      setSaving('error');
    }
  }, []);

  const update = useCallback(
    (f: (p: Project) => Project) => {
      setProject((p) => ({ ...f(p), updatedAt: Date.now() }));
      setSaving('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 300);
    },
    [flush],
  );
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(timer.current);
        void flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flush]);

  const setPhrase = useCallback(
    (key: string, f: (w: PhraseWork) => PhraseWork) =>
      update((p) => ({ ...p, phrases: { ...p.phrases, [key]: f(p.phrases[key] ?? { text: '', review: 'none' }) } })),
    [update],
  );

  const putClip = useCallback(
    async (c: ClipRecord) => {
      setClips((m) => new Map(m).set(c.id, c));
      setSaving('saving');
      try {
        await db.putClip(latest.current.id, c);
        setSaving('saved');
      } catch {
        setSaving('error');
      }
    },
    [],
  );
  const removeClip = useCallback(async (id: string) => {
    setClips((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
    await db.deleteClip(latest.current.id, id).catch(() => setSaving('error'));
  }, []);

  const urlFor = useCallback(
    (id: string) => {
      const c = clips.get(id);
      if (!c) return undefined;
      const hit = urls.current.get(id);
      if (hit && hit.blob === c.blob) return hit.url;
      if (hit) URL.revokeObjectURL(hit.url);
      const url = URL.createObjectURL(c.blob);
      urls.current.set(id, { blob: c.blob, url });
      return url;
    },
    [clips],
  );

  const value = useMemo(() => ({ project, clips, saving, update, setPhrase, putClip, removeClip, urlFor }), [project, clips, saving, update, setPhrase, putClip, removeClip, urlFor]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
