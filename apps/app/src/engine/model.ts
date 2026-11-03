import type { Classifier, Facts, MessageInput } from '@sabitori/core';
import { createLlmClassifier, modelStore, MODEL_FILE_NAME, ModelStoreError } from '@sabitori/understand';
import type { ModelState } from './types';

/**
 * A GGUF file starts with "GGUF", a little-endian uint32 version (2 or 3 today), then uint64 tensor and
 * metadata counts. Checking more than the magic word stops a renamed or cut file before it is copied
 * (a model is a gigabyte: copying it takes minutes on a cheap phone).
 */
export async function checkGgufHeader(file: Blob): Promise<boolean> {
  if (file.size < 24 + 1024 * 1024) return false; // the smallest useful model is many megabytes
  const b = new DataView(await file.slice(0, 24).arrayBuffer());
  if (b.getUint32(0, false) !== 0x47475546) return false; // "GGUF"
  const version = b.getUint32(4, true);
  if (version < 2 || version > 3) return false;
  const tensors = b.getBigUint64(8, true);
  const kvs = b.getBigUint64(16, true);
  return tensors > 0n && tensors < 100_000n && kvs > 0n && kvs < 100_000n;
}

const TEMP_NAME = MODEL_FILE_NAME + '.new';

async function opfs(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await navigator.storage?.getDirectory?.()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Store a model that already loaded, without losing the one there was: write it under a temporary name,
 * then put it in place. If writing fails (the phone is full), the previous file is untouched.
 */
export async function storeModelSafely(file: Blob, deps: { dir?: () => Promise<FileSystemDirectoryHandle | null>; fallbackSave?: (f: Blob) => Promise<void> } = {}): Promise<void> {
  const dir = await (deps.dir ?? opfs)();
  if (!dir) throw new ModelStoreError('OPFS is not available', 'unavailable');
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best effort */
  }
  let tmp: FileSystemFileHandle;
  try {
    tmp = await dir.getFileHandle(TEMP_NAME, { create: true });
    const w = await tmp.createWritable();
    await file.stream().pipeTo(w);
  } catch (e) {
    await dir.removeEntry(TEMP_NAME).catch(() => undefined);
    throw new ModelStoreError(`Could not write model: ${(e as Error)?.message ?? e}`, 'write_failed');
  }
  const move = (tmp as FileSystemFileHandle & { move?: (name: string) => Promise<void> }).move;
  if (typeof move === 'function') {
    try {
      await dir.removeEntry(MODEL_FILE_NAME).catch(() => undefined);
      await move.call(tmp, MODEL_FILE_NAME);
      return;
    } catch {
      /* fall through: copy the old way */
    }
  }
  // No rename in this WebView: the new file was written once, so there is room for it; replace the old one.
  await dir.removeEntry(TEMP_NAME).catch(() => undefined);
  await (deps.fallbackSave ?? ((f) => modelStore.save(f)))(file);
}

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
    /**
     * Check the header, then load the new file as a test, straight from the picked file; only a model that
     * loads is stored (safely, see storeModelSafely) and becomes "ready". A file that fails changes nothing:
     * the previous model, if any, stays on the phone and comes back at the next start.
     */
    async save(file: Blob) {
      if (!(await checkGgufHeader(file))) throw new ModelStoreError('File is not a GGUF model', 'not_gguf');
      if (!(await modelStore.available())) throw new ModelStoreError('OPFS is not available', 'unavailable');
      const before = state;
      set({ status: 'loading', size: file.size, progress: 0 });
      let next: Classifier;
      try {
        // Generous per-call limit: the first answer of a big model on a cheap phone is slow.
        next = await createLlmClassifier({ model: file, fallback: rules, wasmBaseUrl: baseUrl + 'wllama/', timeoutMs: 120_000, onProgress: (f) => set({ progress: Math.min(0.95, f) }) });
        // wllama can report a load as done while the file was unreadable (it logs "failed to read key-value
        // pairs"), and the classifier answers with the rules when the model fails. So ask it once: only an
        // answer produced by the model itself proves the file works.
        const input: MessageInput = { text: 'ENEO: votre facture de 5 000 FCFA est à payer avant le 12 novembre.', source: 'paste', receivedAt: '2026-11-02', region: '' };
        const facts: Facts = { lang: 'fr', dates: [], amounts: [], phones: [], references: [], urls: [], ussdCodes: [] };
        const probe = await next.classify(input, facts);
        if (probe.producedBy !== next.id) throw new Error('the model did not answer');
      } catch {
        set(before);
        throw Object.assign(new Error('The model did not load'), { code: 'not_usable' as const });
      }
      try {
        await storeModelSafely(file);
      } catch (e) {
        set(before);
        throw e;
      }
      llm = next;
      loaded = true;
      set({ status: 'ready', size: file.size, progress: 1 });
      waiters.forEach((w) => w());
      warmUp();
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
