/**
 * Pure helpers for the two optional network features. No import.meta here, so vite.config.ts
 * (build) and the app (runtime) share the exact same parsing.
 */

/** "https://example.org/sabi/" -> "https://example.org/sabi" (https only), else null. */
export function cleanUpdateUrl(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** A base64 Ed25519 public key is 32 bytes: 44 characters of base64. */
export function cleanPublicKey(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  return /^[A-Za-z0-9+/]{43}=$/.test(v) ? v : null;
}

export interface ParsedDsn {
  dsn: string;
  /** "https://o123.ingest.sentry.io" : the only origin crash reports go to. */
  origin: string;
}

export function parseDsn(raw: string | undefined): ParsedDsn | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || !u.username || !u.pathname.replace(/\//g, '')) return null;
    return { dsn: v, origin: u.origin };
  } catch {
    return null;
  }
}

/** The CSP meta of the web build. connect-src names only 'self' and the configured origins. */
export function buildCsp(env: { VITE_UPDATE_URL?: string; VITE_SENTRY_DSN?: string; VITE_COMMUNITY_URL?: string }): string {
  const connect = ["'self'", 'blob:', 'data:'];
  const update = cleanUpdateUrl(env.VITE_UPDATE_URL);
  if (update) connect.push(new URL(update).origin);
  const dsn = parseDsn(env.VITE_SENTRY_DSN);
  if (dsn) connect.push(dsn.origin);
  // The opt-in community service (scam reports, teachings): https only, origin only.
  try {
    const c = new URL((env.VITE_COMMUNITY_URL ?? '').trim());
    if (c.protocol === 'https:') connect.push(c.origin);
  } catch {
    /* not configured */
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${[...new Set(connect)].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
  ].join('; ');
}
