import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from './lib/db';
import type { ClipRecord, PhraseWork, Project } from './lib/model';
import { requestPersistence } from './lib/persist';
import { persistClip, withUnsaved } from './lib/unsaved';

interface Ctx {
  project: Project;
  clips: ReadonlyMap<string, ClipRecord>;
  saving: 'saved' | 'saving' | 'error';
  update: (f: (p: Project) => Project) => void;
  setPhrase: (key: string, f: (w: PhraseWork) => PhraseWork) => void;
  /** Resolves true when the clip is saved on this device. On false it is only in memory: the UI says so. */
  putClip: (c: ClipRecord) => Promise<boolean>;
  /** Clips that are in memory but could not be saved on this device (storage full or blocked). Export now. */
  unsaved: ReadonlySet<string>;
  /** Whether the browser agreed to keep this site's storage (navigator.storage.persist()). null: not asked yet or unsupported. */
  persisted: boolean | null;
  /** The pack was just exported: forget the "clips since export" count. */
  markExported: () => void;
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
  const [unsaved, setUnsaved] = useState<ReadonlySet<string>>(() => new Set());
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const urls = useRef(new Map<string, { blob: Blob; url: string }>());
  const timer = useRef<number>(0);
  const latest = useRef(project);
  /** Mirrors `unsaved` so the project's own save does not report "saved" while a clip is still only in memory. */
  const anyUnsaved = useRef(false);
  latest.current = project;

  const flush = useCallback(async () => {
    try {
      await db.putProject(latest.current);
      setSaving(anyUnsaved.current ? 'error' : 'saved');
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
    // Ask the browser not to clear this site's storage when the phone is short of space.
    void requestPersistence().then(setPersisted);
  }, []);
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
    async (c: ClipRecord): Promise<boolean> => {
      setClips((m) => new Map(m).set(c.id, c));
      setSaving('saving');
      const saved = await persistClip(() => db.putClip(latest.current.id, c));
      // A clip that could not be saved is only in memory: it shows as not saved instead of "Saved".
      setUnsaved((u) => {
        const n = withUnsaved(u, c.id, saved);
        anyUnsaved.current = n.size > 0;
        return n;
      });
      update((p) => ({ ...p, clipsSinceExport: (p.clipsSinceExport ?? 0) + 1 }));
      if (!saved) setSaving('error');
      return saved;
    },
    [update],
  );
  const markExported = useCallback(() => update((p) => ({ ...p, clipsSinceExport: 0 })), [update]);
  const removeClip = useCallback(async (id: string) => {
    setClips((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
    setUnsaved((u) => {
      const n = withUnsaved(u, id, true);
      anyUnsaved.current = n.size > 0;
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

  const value = useMemo(() => ({ project, clips, saving, update, setPhrase, putClip, unsaved, persisted, markExported, removeClip, urlFor }), [project, clips, saving, update, setPhrase, putClip, unsaved, persisted, markExported, removeClip, urlFor]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
