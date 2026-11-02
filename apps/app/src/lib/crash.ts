import { config } from '../config';
import { noteMessageText, noteName, scrubEvent } from './scrub';

declare const __APP_VERSION__: string;

/**
 * Optional crash reports. Nothing here runs unless VITE_SENTRY_DSN is set AND the person switched
 * "Send error reports" on. The Sentry SDK is loaded on demand (its own chunk), never at start-up
 * when the feature is off. Every event goes through scrubEvent before it can be sent.
 */
type SentryModule = typeof import('@sentry/browser');
let sentry: SentryModule | null = null;
let starting: Promise<void> | null = null;

/** Screens call this with message text they display, so a report can never contain it. Memory only. */
export function rememberMessage(...texts: (string | null | undefined)[]): void {
  if (!config.crashReports) return;
  for (const t of texts) noteMessageText(t);
}

/** Names on screen (a sender typed in, the senders of history rows): a report never contains them either. */
export function rememberNames(...names: (string | null | undefined)[]): void {
  if (!config.crashReports) return;
  for (const n of names) noteName(n);
}

export const crashReportingActive = (): boolean => sentry !== null;

export interface CrashOptions {
  /** Pack tag -> version, for tags. */
  packVersions: () => Record<string, string>;
}

export async function startCrashReporting(opts: CrashOptions): Promise<void> {
  const cfg = config.crashReports;
  if (!cfg || sentry) return;
  starting ??= (async () => {
    const S = await import('@sentry/browser');
    const release = __APP_VERSION__;
    S.init({
      dsn: cfg.dsn,
      environment: cfg.environment,
      release,
      // v11 replaced sendDefaultPii with dataCollection: switch every category off. (sendDefaultPii is
      // still passed, for older SDKs; it is not in v11's types.)
      sendDefaultPii: false,
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0 },
      // Only unhandled errors/rejections, de-duplicated, with their causes. No replay, no tracing,
      // no breadcrumbs (console, fetch, XHR, clicks, navigation), no sessions, no page/request context.
      defaultIntegrations: false,
      integrations: [S.globalHandlersIntegration({ onerror: true, onunhandledrejection: true }), S.dedupeIntegration(), S.linkedErrorsIntegration()],
      maxBreadcrumbs: 0,
      beforeBreadcrumb: () => null,
      sendClientReports: false,
      enableLogs: false,
      beforeSend: (event) =>
        scrubEvent(event, { appVersion: release, packVersions: opts.packVersions() }) as never,
      // Tracing is never set up (no tracing integration, no sample rate), so no transaction or span can exist.
    } as Parameters<typeof S.init>[0]);
    S.setUser(null);
    sentry = S;
  })().finally(() => {
    starting = null;
  });
  await starting;
}

/** Switch off at runtime: flush nothing, close the client, forget it. */
export async function stopCrashReporting(): Promise<void> {
  await starting?.catch(() => undefined);
  const S = sentry;
  sentry = null;
  if (!S) return;
  try {
    await S.close(0);
  } catch {
    /* already closed */
  }
  S.getCurrentScope().setClient(undefined);
}
