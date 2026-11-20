import type { ScamReportIn, TeachingIn } from './validate';

export interface PublishedScam {
  id: string;
  createdAt: string;
  level: 'likely_scam' | 'caution';
  text: string;
  senderKind: 'number' | 'name' | 'unknown';
  senderValue: string | null;
  claimed: string | null;
  signals: string[];
  /** Published reports with the same sender number (this one included). */
  reports: number;
}

export interface PendingScam extends ScamReportIn {
  id: string;
  createdAt: string;
}

export interface Store {
  addScam(id: string, at: string, r: ScamReportIn, deleteHash?: string): Promise<void>;
  published(region: string, limit: number): Promise<PublishedScam[]>;
  pending(limit: number): Promise<PendingScam[]>;
  review(id: string, status: 'published' | 'rejected', at: string): Promise<boolean>;
  addTeaching(id: string, at: string, t: Omit<TeachingIn, 'audio'> & { audioKey?: string; audioType?: string }, deleteHash?: string): Promise<void>;
  /** Deletes the item if its delete hash matches. Returns false when nothing matched, else the audio key to remove (or null). */
  remove(kind: 'scam' | 'teach', id: string, deleteHash: string): Promise<false | { audioKey: string | null }>;
  /** Deletes reports and teachings created before `before`; returns the audio keys of the deleted teachings. */
  purge(before: string): Promise<string[]>;
  teachings(since: string, limit: number): Promise<Array<Record<string, unknown>>>;
  /** Adds one to today's counter of this bucket and returns the new count. */
  bump(bucket: string, day: string): Promise<number>;
}

export interface Blobs {
  put(key: string, data: Uint8Array, type: string): Promise<void>;
  delete(key: string): Promise<void>;
}
