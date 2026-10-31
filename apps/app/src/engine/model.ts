import type { Classifier, Facts, MessageInput } from '@sabitori/core';
import { createLlmClassifier, modelStore } from '@sabitori/understand';
import type { ModelState } from './types';

/**
 * The optional on-device understanding model. Rules are always the fallback;
 * the model loads lazily after first paint and never blocks the UI.
 */
export function createModelController(rules: Classifier, baseUrl: string) {
  let llm: Classifier | null = null;
  const waiters = new Set<() => void>();
  let state: ModelState = { status: 'none', size: 0, progress: 0 };
  const listeners = new Set<(s: ModelState) => void>();
  const set = (patch: Partial<ModelState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  };

  /** One tiny classify call when idle, so the model's cache holds the fixed prompt prefix. Never blocks the UI. */
  function warmUp() {
    const cls = llm;
    if (!cls) return;
    const run = () => {
      const input: MessageInput = { text: 'Bonjour.', source: 'paste', receivedAt: new Date().toISOString().slice(0, 10), region: '' };
      const facts: Facts = { lang: 'fr', dates: [], amounts: [], phones: [], references: [], urls: [], ussdCodes: [] };
      void cls.classify(input, facts).catch(() => undefined);
    };
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(run, { timeout: 5000 });
    else setTimeout(run, 2000);
  }

  let loaded = false;
  async function load() {
    try {
      loaded = true;
      if (!(await modelStore.available())) return set({ status: 'unsupported' });
      if (!(await modelStore.has())) {
        llm = null;
        return set({ status: 'none', size: 0, progress: 0 });
      }
      const blob = await modelStore.load();
      if (!blob) return set({ status: 'none', size: 0 });
      set({ status: 'loading', size: blob.size, progress: 0 });
      llm = await createLlmClassifier({
        model: blob,
        fallback: rules,
        wasmBaseUrl: baseUrl + 'wllama/',
        onProgress: (f) => set({ progress: f }),
      });
      set({ status: 'ready', progress: 1 });
      waiters.forEach((w) => w());
      warmUp();
    } catch {
      llm = null;
      set({ status: 'failed' });
    } finally {
      waiters.forEach((w) => w());
    }
  }

  return {
    state: () => state,
    subscribe(fn: (s: ModelState) => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    available: () => modelStore.available().catch(() => false),
    /** Call after first paint. */
    init: load,
    async save(file: Blob) {
      await modelStore.save(file);
      void load();
    },
    async remove() {
      await modelStore.remove();
      llm = null;
      set({ status: 'none', size: 0, progress: 0 });
    },
    /** Rules are always the default classifier: the card appears at once. */
    classifier: () => rules,
    /**
     * The LLM classifier, or null when no model is present. While the model is
     * still loading this waits (up to `ms`) for it.
     */
    async llm(ms: number): Promise<Classifier | null> {
      if (state.status === 'loading' || (state.status === 'none' && !loaded)) {
        await new Promise<void>((res) => {
          const t = setTimeout(res, ms);
          waiters.add(() => { clearTimeout(t); res(); });
        });
      }
      return llm;
    },
  };
}
