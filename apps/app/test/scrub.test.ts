import { beforeEach, describe, expect, it } from 'vitest';
import { forgetMessageTexts, noteMessageText, scrubEvent, scrubString } from '../src/lib/scrub';

const MESSAGE =
  "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 12 novembre 2026. Service client: 677 00 12 34. Contact M. Mbarga Jean Pierre.";
const ctx = { appVersion: '0.1.0', packVersions: { fr: '0.1.0', en: '0.2.0' } };

const SECRETS = ['0451233987', '18 450', '18450', '450', '677 00 12 34', '677', '12 34', '12 novembre', 'novembre 2026', '2026', 'Mbarga', 'Jean Pierre', "facture d'électricité", 'montant de 18', 'Date limite de paiement', 'Service client'];

function leaks(payload: unknown): string[] {
  const s = JSON.stringify(payload).toLowerCase();
  return SECRETS.filter((x) => s.includes(x.toLowerCase()));
}

/** What @sentry/browser produces for an error thrown while a message is on screen, with every kind of extra it can carry. */
function sentryEvent() {
  return {
    event_id: 'abcdef0123456789abcdef0123456789',
    timestamp: 1793000000.5,
    platform: 'javascript',
    level: 'error',
    release: '0.1.0',
    environment: 'production',
    sdk: { name: 'sentry.javascript.browser', version: '11.10.0', packages: [{ name: 'npm:@sentry/browser', version: '11.10.0' }] },
    transaction: '#/card/ENEO-0451233987',
    server_name: 'phone-677001234',
    user: { id: '677001234', ip_address: '{{auto}}', username: 'Mbarga Jean' },
    request: { url: 'https://localhost/#/card/0451233987?msg=18450', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; TECNO KG5) Chrome/120', Referer: 'x' }, cookies: { a: 'b' } },
    extra: { text: MESSAGE, amount: '18 450 FCFA' },
    breadcrumbs: [{ category: 'ui.click', message: 'button.fact "18 450 FCFA"' }, { category: 'console', message: MESSAGE }],
    contexts: {
      os: { name: 'Android', version: '13' },
      device: { family: 'TECNO KG5', model: 'KG5', arch: 'arm64', screen_resolution: '720x1600', memory_size: 2147483648, online: true },
      browser: { name: 'Chrome', version: '120.0.6099.43' },
      trace: { trace_id: 'ff', span_id: '12' },
      culture: { locale: 'fr-CM', timezone: 'Africa/Douala' },
      state: { value: { selected: MESSAGE } },
    },
    exception: {
      values: [
        {
          type: 'TypeError',
          value: `Cannot read properties of undefined (reading 'amount') while rendering ${MESSAGE}`,
          mechanism: { type: 'auto.browser.global_handlers.onerror', handled: false },
          stacktrace: {
            frames: [
              {
                filename: 'https://localhost/assets/index-Bx3k92aQ.js',
                abs_path: 'https://localhost/assets/index-Bx3k92aQ.js',
                function: 'renderCard',
                lineno: 4821,
                colno: 17,
                in_app: true,
                vars: { text: MESSAGE, amount: 18450, phone: '677 00 12 34' },
                pre_context: [`const note = "${MESSAGE}"`],
                context_line: 'throw new Error("amount 18 450 FCFA")',
                post_context: ['}'],
              },
            ],
          },
        },
        { type: 'Error', value: 'Facture N° 0451233987 : 18 450 FCFA avant le 12/11/2026, appelez 677 00 12 34 ou +237 677 00 12 34 (jean@example.com) https://pay.example/x?id=0451233987' },
      ],
    },
    message: 'Failed for "ENEO … 18 450 FCFA … 677 00 12 34"',
  };
}

describe('crash report scrubber', () => {
  beforeEach(() => {
    forgetMessageTexts();
    noteMessageText(MESSAGE);
  });

  it('leaks nothing of a realistic payload', () => {
    const out = scrubEvent(sentryEvent(), ctx)!;
    expect(out).not.toBeNull();
    expect(leaks(out)).toEqual([]);
    // no 3+ digit run anywhere in the free text (event_id, timestamp and line numbers are structural)
    const free = JSON.stringify({ e: (out as any).exception, m: (out as any).message }).replace(/"(lineno|colno)":\d+/g, '');
    expect(free).not.toMatch(/\d{3,}/);
  });

  it('keeps no request, user, extra, breadcrumbs, vars, source lines or foreign contexts', () => {
    const out = scrubEvent(sentryEvent(), ctx)! as Record<string, any>;
    for (const k of ['request', 'user', 'extra', 'breadcrumbs', 'transaction', 'server_name', 'spans']) expect(out).not.toHaveProperty(k);
    expect(Object.keys(out.contexts).sort()).toEqual(['app', 'device', 'os']);
    expect(out.contexts.os).toEqual({ name: 'Android', version: '13' });
    expect(out.contexts.device).toEqual({ arch: 'arm64' });
    expect(out.contexts.app).toEqual({ app_version: '0.1.0' });
    const frame = out.exception.values[0].stacktrace.frames[0];
    expect(Object.keys(frame).sort()).toEqual(['colno', 'filename', 'function', 'in_app', 'lineno']);
    expect(frame.filename).toBe('/assets/index-Bx3k92aQ.js');
  });

  it('tags only app and pack versions', () => {
    const out = scrubEvent(sentryEvent(), ctx)! as Record<string, any>;
    expect(out.tags).toEqual({ app_version: '0.1.0', pack_fr: '0.1.0', pack_en: '0.2.0' });
    expect(out.release).toBe('0.1.0');
  });

  it('keeps what helps fix the bug', () => {
    const out = scrubEvent(sentryEvent(), ctx)! as Record<string, any>;
    expect(out.exception.values[0].type).toBe('TypeError');
    expect(out.exception.values[0].value).toContain("Cannot read properties of undefined (reading 'amount')");
    expect(out.exception.values[0].stacktrace.frames[0]).toMatchObject({ function: 'renderCard', lineno: 4821, colno: 17 });
  });

  it('scrubs amounts, phones, dates, digit runs and codes without any message remembered', () => {
    forgetMessageTexts();
    const cases: [string, string[]][] = [
      ['Facture 18 450 FCFA', ['18 450', '450']],
      ['pay 18.450 F CFA now', ['18.450', '450']],
      ['montant 1,200,000 XAF', ['1,200,000', '200']],
      ['FCFA 5000', ['5000']],
      ['appelez le 677 00 12 34', ['677', '12 34']],
      ['call +237 677 00 12 34', ['237', '677']],
      ['tel 699-12-34-56', ['699', '34-56']],
      ['avant le 12 novembre 2026', ['12 novembre', '2026']],
      ['by November 12th, 2026', ['November 12', '2026']],
      ['le 12/11/2026', ['12/11']],
      ['at 2026-11-12T10:00:00Z', ['2026-11-12']],
      ['ref 0451233987', ['0451233987']],
      ['dial #150*1*2#', ['150']],
      ['mail jean.mbarga@example.com', ['jean.mbarga', 'example.com']],
      ['see https://pay.example/x?id=1', ['pay.example']],
    ];
    for (const [input, banned] of cases) {
      const out = scrubString(input, []);
      for (const b of banned) expect(out, `${input} -> ${out}`).not.toContain(b);
      expect(out).not.toMatch(/\d{3,}/);
    }
  });

  it('removes any 6+ character stretch of a remembered message, wherever it appears and whatever the case or spacing', () => {
    const out = scrubString('boom: VOTRE   FACTURE d\'électricité failed; mbarga!', currentTexts());
    expect(out).not.toMatch(/facture|mbarga|lectricit/i);
    expect(out).toContain('boom');
  });

  it('does not damage ordinary error text', () => {
    const out = scrubString("Cannot read properties of undefined (reading 'map') at x", currentTexts());
    expect(out).toContain('Cannot read properties of undefined');
  });

  it('remembers several messages and forgets edits of the same one', () => {
    forgetMessageTexts();
    noteMessageText('Premier message très secret numéro un');
    noteMessageText('Deuxième message tout aussi secret');
    noteMessageText('Deuxième message tout aussi secret et plus long');
    const out = scrubString('boom Premier message tres secret / Deuxième message tout aussi secret et plus long', currentTexts());
    expect(out).not.toMatch(/secret/);
  });

  it('drops the event rather than throw on a malformed one', () => {
    expect(scrubEvent(null, ctx)).toBeNull();
    expect(scrubEvent({ exception: { values: [null, 5, { stacktrace: { frames: [1, null] } }] } }, ctx)).toMatchObject({ exception: { values: [{ stacktrace: { frames: [] } }] } });
  });

  it('is idempotent', () => {
    const once = scrubEvent(sentryEvent(), ctx);
    expect(scrubEvent(once, ctx)).toEqual(once);
  });
});

import { currentMessageTexts } from '../src/lib/scrub';
const currentTexts = () => currentMessageTexts();
