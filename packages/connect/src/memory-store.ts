import type { InstalledState, UpdateStore } from './types.js';

type TestHooks = { failOnStage?: (path: string) => boolean; dropActive?: (path: string) => void };

/** In-memory store (tests). */
export function createMemoryStore(): UpdateStore & TestHooks {
  let state: InstalledState | null = null;
  let active = new Map<string, Uint8Array>();
  let staging = new Map<string, Uint8Array>();
  const store: UpdateStore & TestHooks = {
    dropActive: (path) => void active.delete(path),
    async getState() {
      return state ? structuredClone(state) : null;
    },
    async getFile(path) {
      return active.get(path) ?? null;
    },
    async hasFile(path) {
      return active.has(path);
    },
    async getStaged(path) {
      return staging.get(path) ?? null;
    },
    async stage(path, bytes) {
      if (store.failOnStage?.(path)) throw new Error('disk full');
      staging.set(path, bytes);
    },
    async discardStaging() {
      staging = new Map();
    },
    async commit(next) {
      const merged = new Map<string, Uint8Array>();
      for (const [path, meta] of Object.entries(next.files)) {
        const bytes = staging.get(path) ?? (state?.files[path]?.sha256 === meta.sha256 ? active.get(path) : undefined);
        if (!bytes) throw new Error(`commit: ${path} is not staged`);
        merged.set(path, bytes);
      }
      active = merged;
      staging = new Map();
      state = structuredClone(next);
    },
    async clear() {
      state = null;
      active = new Map();
      staging = new Map();
    },
  };
  return store;
}
