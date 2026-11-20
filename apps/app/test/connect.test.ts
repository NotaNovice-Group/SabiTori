import { describe, expect, it } from 'vitest';
import { buildCsp, cleanPublicKey, cleanUpdateUrl, parseDsn } from '../src/lib/connect-env';
import { readConfig } from '../src/config';
import { DEFAULTS, sanitize } from '../src/lib/settings';
import { isCheckDue, networkAllowsUpdate, DAY_MS } from '../src/lib/updates';

const KEY = 'e5LvSrC9G4f0G7j4KKx1geJ+yU1fGTM5egnfYDzDpGg=';
const DSN = 'https://abc123@o42.ingest.sentry.io/7';

describe('configuration', () => {
  it('everything is absent when nothing is set', () => {
    expect(readConfig({})).toEqual({ updates: null, crashReports: null, community: null });
    expect(readConfig({ VITE_UPDATE_URL: '', VITE_UPDATE_PUBLIC_KEY: '', VITE_SENTRY_DSN: '' })).toEqual({ updates: null, crashReports: null, community: null });
  });
  it('updates need an https url AND a valid key', () => {
    expect(readConfig({ VITE_UPDATE_URL: 'https://u.example/sabi/' }).updates).toBeNull();
    expect(readConfig({ VITE_UPDATE_PUBLIC_KEY: KEY }).updates).toBeNull();
    expect(readConfig({ VITE_UPDATE_URL: 'http://u.example/sabi', VITE_UPDATE_PUBLIC_KEY: KEY }).updates).toBeNull();
    expect(readConfig({ VITE_UPDATE_URL: 'https://u.example/sabi/?a=1', VITE_UPDATE_PUBLIC_KEY: KEY }).updates).toBeNull();
    expect(readConfig({ VITE_UPDATE_URL: 'https://u.example/sabi/', VITE_UPDATE_PUBLIC_KEY: KEY }).updates).toEqual({ url: 'https://u.example/sabi', publicKey: KEY });
  });
  it('crash reports need a DSN; environment defaults to production', () => {
    expect(readConfig({ VITE_COMMUNITY_URL: 'https://c.example/' }).community).toEqual({ url: 'https://c.example' });
    expect(readConfig({ VITE_COMMUNITY_URL: 'http://c.example' }).community).toBeNull();
    expect(readConfig({ VITE_SENTRY_DSN: 'nonsense' }).crashReports).toBeNull();
    expect(readConfig({ VITE_SENTRY_DSN: 'http://k@x.io/1' }).crashReports).toBeNull();
    expect(readConfig({ VITE_SENTRY_DSN: DSN }).crashReports).toEqual({ dsn: DSN, environment: 'production' });
    expect(readConfig({ VITE_SENTRY_DSN: DSN, VITE_SENTRY_ENVIRONMENT: 'beta' }).crashReports?.environment).toBe('beta');
  });
  it('parsers', () => {
    expect(cleanUpdateUrl(undefined)).toBeNull();
    expect(cleanPublicKey('short')).toBeNull();
    expect(parseDsn(DSN)?.origin).toBe('https://o42.ingest.sentry.io');
  });
});

describe('CSP', () => {
  const connect = (env: Record<string, string>) => /connect-src ([^;]*)/.exec(buildCsp(env))![1]!.split(' ');
  it('allows only self when nothing is configured', () => {
    expect(connect({})).toEqual(["'self'", 'blob:', 'data:']);
  });
  it('adds exactly the configured origins', () => {
    const c = connect({ VITE_UPDATE_URL: 'https://u.example/sabi/', VITE_SENTRY_DSN: DSN });
    expect(c).toEqual(["'self'", 'blob:', 'data:', 'https://u.example', 'https://o42.ingest.sentry.io']);
    expect(buildCsp({})).not.toMatch(/\*|http:/);
  });
  it('adds the community service origin, https only', () => {
    expect(connect({ VITE_COMMUNITY_URL: 'https://c.example/x' })).toEqual(["'self'", 'blob:', 'data:', 'https://c.example']);
    expect(connect({ VITE_COMMUNITY_URL: 'http://c.example' })).toEqual(["'self'", 'blob:', 'data:']);
  });
  it('ignores invalid values', () => {
    expect(connect({ VITE_UPDATE_URL: 'http://evil.example', VITE_SENTRY_DSN: 'junk' })).toEqual(["'self'", 'blob:', 'data:']);
  });
});

describe('settings and schedule', () => {
  it('both features are off by default and by sanitising junk', () => {
    expect(DEFAULTS.updatesOn).toBe(false);
    expect(DEFAULTS.crashOn).toBe(false);
    expect(sanitize({ updatesOn: 'yes', crashOn: 1 })).toMatchObject({ updatesOn: false, crashOn: false });
    expect(sanitize({ updatesOn: true, crashOn: true })).toMatchObject({ updatesOn: true, crashOn: true });
  });
  it('checks at most once a day', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    const memo = (iso: string | null) => ({ lastCheckAt: iso, lastStatus: null, lastReason: null });
    expect(isCheckDue(memo(null), now)).toBe(true);
    expect(isCheckDue(memo(new Date(now - DAY_MS + 1000).toISOString()), now)).toBe(false);
    expect(isCheckDue(memo(new Date(now - DAY_MS).toISOString()), now)).toBe(true);
    expect(isCheckDue(memo(new Date(now + DAY_MS).toISOString()), now)).toBe(true); // clock went backwards
  });
  it('skips cellular only when the browser says so', () => {
    expect(networkAllowsUpdate({})).toBe(true);
    expect(networkAllowsUpdate({ connection: {} })).toBe(true);
    expect(networkAllowsUpdate({ connection: { type: 'wifi' } })).toBe(true);
    expect(networkAllowsUpdate({ connection: { type: 'cellular' } })).toBe(false);
  });
});
