import type { Classifier } from '@sabitori/core';
import { createLlmClassifier, modelStore } from '@sabitori/understand';
import type { ModelState } from './types';

/**
 * The optional on-device understanding model. Rules are always the fallback;
 * the model loads lazily after first paint and never blocks the UI.
 */
export function createModelController(rules: Classifier, baseUrl: string) {
  let current: Classifier = rules;
  let state: ModelState = { status: 'none', size: 0, progress: 0 };
  const listeners = new Set<(s: ModelState) => void>();
  const set = (patch: Partial<ModelState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  };

  async function load() {
    try {
      if (!(await modelStore.available())) return set({ status: 'unsupported' });
      if (!(await modelStore.has())) {
        current = rules;
        return set({ status: 'none', size: 0, progress: 0 });
      }
      const blob = await modelStore.load();
      if (!blob) return set({ status: 'none', size: 0 });
      set({ status: 'loading', size: blob.size, progress: 0 });
      current = await createLlmClassifier({
        model: blob,
        fallback: rules,
        wasmBaseUrl: baseUrl + 'wllama/',
        onProgress: (f) => set({ progress: f }),
      });
      set({ status: 'ready', progress: 1 });
    } catch {
      current = rules;
      set({ status: 'failed' });
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
      current = rules;
      set({ status: 'none', size: 0, progress: 0 });
    },
    classifier: () => ({
      get id() {
        return current.id;
      },
      classify: (i, f) => current.classify(i, f),
    }) as Classifier,
  };
}
