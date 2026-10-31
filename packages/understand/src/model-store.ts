/** Model file storage in OPFS. Degrades cleanly (has() false, load() null, save() throws) when unavailable. */

export const MODEL_FILE_NAME = 'sabitori-model.gguf';

/** True when the first four bytes are "GGUF". */
export async function isGgufBlob(file: Blob): Promise<boolean> {
  if (file.size < 8) return false;
  const b = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return b[0] === 0x47 && b[1] === 0x47 && b[2] === 0x55 && b[3] === 0x46;
}

export class ModelStoreError extends Error {
  constructor(
    message: string,
    readonly code: 'unavailable' | 'not_gguf' | 'write_failed',
  ) {
    super(message);
    this.name = 'ModelStoreError';
  }
}

async function root(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!s || typeof s.getDirectory !== 'function') return null;
    return await s.getDirectory();
  } catch {
    return null;
  }
}

async function requestPersist(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best effort */
  }
}

export const modelStore = {
  async available(): Promise<boolean> {
    return (await root()) !== null;
  },

  async has(): Promise<boolean> {
    const dir = await root();
    if (!dir) return false;
    try {
      const f = await (await dir.getFileHandle(MODEL_FILE_NAME)).getFile();
      return f.size > 0;
    } catch {
      return false;
    }
  },

  async save(file: Blob): Promise<void> {
    if (!(await isGgufBlob(file))) throw new ModelStoreError('File is not a GGUF model', 'not_gguf');
    const dir = await root();
    if (!dir) throw new ModelStoreError('OPFS is not available', 'unavailable');
    await requestPersist();
    try {
      const handle = await dir.getFileHandle(MODEL_FILE_NAME, { create: true });
      const w = await handle.createWritable();
      await file.stream().pipeTo(w);
    } catch (e) {
      try {
        await dir.removeEntry(MODEL_FILE_NAME);
      } catch {
        /* nothing to clean */
      }
      throw new ModelStoreError(`Could not write model: ${(e as Error)?.message ?? e}`, 'write_failed');
    }
  },

  async load(): Promise<Blob | null> {
    const dir = await root();
    if (!dir) return null;
    try {
      const f = await (await dir.getFileHandle(MODEL_FILE_NAME)).getFile();
      return f.size > 0 ? f : null;
    } catch {
      return null;
    }
  },

  async remove(): Promise<void> {
    const dir = await root();
    if (!dir) return;
    try {
      await dir.removeEntry(MODEL_FILE_NAME);
    } catch {
      /* already gone */
    }
  },
};
