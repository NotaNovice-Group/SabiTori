import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Build-time config, mutable per test. */
const cfg = vi.hoisted(() => ({ crashReports: null as { dsn: string; environment: string } | null, updates: null }));
vi.mock('../src/config', () => ({ config: cfg, anyConnected: () => true }));

/** The real SDK with a transport that records envelopes instead of sending them. */
const { sent, counter } = vi.hoisted(() => ({ sent: [] as unknown[], counter: { inits: 0 } }));
vi.mock('@sentry/browser', async (importOriginal) => {
  const m = await importOriginal<typeof import('@sentry/browser')>();
  return {
    ...m,
    init: (o: Record<string, unknown>) => {
      counter.inits++;
      return m.init({ ...o, transport: () => ({ send: async (env: unknown) => (sent.push(env), {}), flush: async () => true }) } as never);
    },
  };
});

import * as Sentry from '@sentry/browser';
import { crashReportingActive, rememberMessage, startCrashReporting, stopCrashReporting } from '../src/lib/crash';
import { forgetMessageTexts } from '../src/lib/scrub';

const MESSAGE = 'ENEO: facture 18 450 FCFA, payer avant le 12 novembre, appelez 677 00 12 34, M. Mbarga';
const flush = () => Sentry.flush(1000);
const packVersions = () => ({ fr: '0.1.0' });

describe('crash reporting switch', () => {
  beforeEach(() => {
    sent.length = 0;
    forgetMessageTexts();
  });
  afterEach(async () => {
    await stopCrashReporting();
    cfg.crashReports = null;
  });

  it('never starts without a DSN in the build', async () => {
    cfg.crashReports = null;
    await startCrashReporting({ packVersions });
    expect(crashReportingActive()).toBe(false);
    expect(counter.inits).toBe(0);
    Sentry.captureException(new Error('no dsn ' + MESSAGE));
    await flush();
    expect(sent).toEqual([]);
  });

  it('sends only scrubbed events while on, and nothing at all after switching off', async () => {
    cfg.crashReports = { dsn: 'https://abc@o1.ingest.sentry.io/1', environment: 'test' };
    await startCrashReporting({ packVersions });
    expect(crashReportingActive()).toBe(true);
    rememberMessage(MESSAGE);
    Sentry.captureException(new Error(`render failed for ${MESSAGE}`));
    await flush();
    expect(sent).toHaveLength(1);
    const text = JSON.stringify(sent[0]);
    for (const secret of ['18 450', '450', 'novembre', '677', '12 34', 'Mbarga', 'ENEO', 'facture']) expect(text).not.toContain(secret);
    expect(text).toContain('render failed for');
    expect(text).toContain('"pack_fr":"0.1.0"');
    // the envelope carries no user, request, breadcrumbs or contexts beyond app/os/device
    for (const k of ['"user"', '"request"', '"breadcrumbs"', '"extra"', '"ip_address"']) expect(text).not.toContain(k);

    await stopCrashReporting();
    expect(crashReportingActive()).toBe(false);
    Sentry.captureException(new Error('after off ' + MESSAGE));
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('can be switched on again after off', async () => {
    cfg.crashReports = { dsn: 'https://abc@o1.ingest.sentry.io/1', environment: 'test' };
    await startCrashReporting({ packVersions });
    await stopCrashReporting();
    await startCrashReporting({ packVersions });
    Sentry.captureException(new Error('again'));
    await flush();
    expect(sent).toHaveLength(1);
  });
});
