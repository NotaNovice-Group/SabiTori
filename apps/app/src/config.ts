import { cleanPublicKey, cleanUpdateUrl, parseDsn } from './lib/connect-env';

/**
 * Build-time configuration of the two OPTIONAL network features. A feature that is not
 * configured is absent: no settings row, no code path, no network request.
 * See .env.example.
 */
export interface Config {
  /** Both an https update URL and a valid pinned public key are needed. */
  updates: { url: string; publicKey: string } | null;
  crashReports: { dsn: string; environment: string } | null;
  /** Opt-in scam reports and teachings (services/community). https only. */
  community: { url: string } | null;
}

function cleanServiceUrl(v: string | undefined): string | null {
  const s = (v ?? '').trim().replace(/\/+$/, '');
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.search && !u.hash ? u.href.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const url = cleanUpdateUrl(env.VITE_UPDATE_URL);
  const publicKey = cleanPublicKey(env.VITE_UPDATE_PUBLIC_KEY);
  const dsn = parseDsn(env.VITE_SENTRY_DSN);
  return {
    updates: url && publicKey ? { url, publicKey } : null,
    crashReports: dsn ? { dsn: dsn.dsn, environment: (env.VITE_SENTRY_ENVIRONMENT ?? '').trim() || 'production' } : null,
    community: cleanServiceUrl(env.VITE_COMMUNITY_URL) ? { url: cleanServiceUrl(env.VITE_COMMUNITY_URL)! } : null,
  };
}

export const config: Config = readConfig(import.meta.env as unknown as Record<string, string | undefined>);
export const anyConnected = (c: Config = config): boolean => c.updates !== null || c.crashReports !== null;
