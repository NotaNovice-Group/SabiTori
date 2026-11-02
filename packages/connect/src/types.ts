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
  files: IndexFile[];
}

/** What the store remembers about the active set. */
export interface InstalledState {
  sequence: number;
  updatedAt: string;
  files: Record<string, { sha256: string; size: number }>;
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
}

export type UpdateFailure =
  | 'network'
  | 'bad_signature'
  | 'bad_index'
  | 'rollback'
  | 'bad_file'
  | 'store';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
