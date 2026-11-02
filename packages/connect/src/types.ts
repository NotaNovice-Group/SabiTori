export interface IndexFile {
  path: string;
  sha256: string;
  size: number;
}

export interface UpdateIndex {
  formatVersion: 1;
  channel: 'stable';
  sequence: number;
  issuedAt: string;
  /** Files every phone gets: regions, packs/index.json, and (in a flat index) every language's files. */
  files: IndexFile[];
  /**
   * Optional, for channels with many languages. Each language has its own file list, `packs/<tag>/index.json`
   * (pinned here by sha256, so the signature of this index covers it). A phone downloads the lists, and so the
   * files, of the languages it needs only (`check({ tags })`). Files of such a language must NOT also be in `files`.
   */
  languages?: Record<string, { index: IndexFile; version?: string }>;
}

/** The per-language file list `packs/<tag>/index.json`. */
export interface LanguageIndex {
  formatVersion: 1;
  tag: string;
  files: IndexFile[];
}

/** What the store remembers about the active set. */
export interface InstalledState {
  sequence: number;
  updatedAt: string;
  files: Record<string, { sha256: string; size: number }>;
  /** Per-language indexes installed (tag -> sha256 of its `packs/<tag>/index.json`). Absent for flat updates. */
  languages?: Record<string, { sha256: string }>;
  /**
   * Set by quarantineActive: the files stay on disk but the store serves none of them, so the app runs on its
   * bundled files. The sequence is kept (no rollback to an older update); a newer update replaces the set.
   */
  quarantined?: { at: string; reason: string };
}

/**
 * Where updated files live. Two areas: the active set (what the app reads) and a staging area
 * (what an update is downloading). `commit` switches them in one atomic step.
 */
export interface UpdateStore {
  getState(): Promise<InstalledState | null>;
  /** Bytes of a file in the ACTIVE set, or null. */
  getFile(path: string): Promise<Uint8Array | null>;
  /** Whether the ACTIVE set holds this file (without reading its bytes). */
  hasFile(path: string): Promise<boolean>;
  /** Bytes of a file in the STAGING area, or null. */
  getStaged(path: string): Promise<Uint8Array | null>;
  stage(path: string, bytes: Uint8Array): Promise<void>;
  discardStaging(): Promise<void>;
  /**
   * Atomically make `state` the active set. Every file of `state` must be in staging or already
   * active with the same hash; otherwise nothing changes and this rejects. Staged files replace
   * active ones; active files not in `state` are dropped; staging is emptied.
   */
  commit(state: InstalledState): Promise<void>;
  /** Forget everything (switching the feature off and deleting data). */
  clear(): Promise<void>;
  /**
   * Stop serving the active set (getFile and hasFile answer nothing) without deleting it or forgetting its
   * sequence. Optional: use quarantineActive(store), which falls back to clear() for a store without it.
   */
  quarantine?(reason: string): Promise<void>;
}

export type UpdateStatus = 'up_to_date' | 'updated' | 'failed';

export interface UpdateResult {
  status: UpdateStatus;
  /** Installed sequence after this check (0 when nothing is installed). */
  sequence: number;
  changed: string[];
  error?: string;
  /** Short machine reason when failed, for plain-words messages in the app. */
  reason?: UpdateFailure;
  /** When failed because a file was refused (hash, size or content): its path. `error` says why, in plain words. */
  file?: string;
  /** Languages (pack tags) that have their own file list and are installed now. Empty for a flat channel. */
  languages?: string[];
}

export type UpdateFailure =
  | 'network'
  | 'bad_signature'
  | 'bad_index'
  | 'rollback'
  | 'bad_file'
  | 'store';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
