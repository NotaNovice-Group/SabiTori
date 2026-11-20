import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isAllowedPath, parseAlerts, validateUpdateFile } from '../src/index.js';

const ok = { id: 'fake-eneo-2026-11', date: '2026-11-20', expires: '2026-12-20', title: { fr: 'Faux SMS ENEO', en: 'Fake ENEO SMS' }, body: { fr: 'Un SMS dit être d’ENEO et demande 2 000 FCFA pour éviter une coupure. ENEO ne fait pas cela.', en: 'An SMS claims to be from ENEO and asks for 2,000 FCFA to avoid a cut. ENEO does not do this.' } };
const enc = (j: unknown) => new TextEncoder().encode(JSON.stringify(j));

describe('scam alerts over the update channel', () => {
  it('the alerts file of a region is an allowed update path', () => {
    expect(isAllowedPath('regions/CM/alerts.json')).toBe(true);
    expect(isAllowedPath('regions/CM/alerts2.json')).toBe(false);
  });
  it('accepts a well-formed alert, and the empty file shipped in the app', () => {
    expect(parseAlerts({ alerts: [ok] })).toHaveLength(1);
    const shipped = readFileSync(resolve(__dirname, '../../../regions/CM/alerts.json'));
    expect(() => validateUpdateFile('regions/CM/alerts.json', shipped)).not.toThrow();
  });
  it('refuses a link, a phone number or a USSD code in an alert (a stolen key must not send people to a scam)', () => {
    for (const bad of ['Payez sur http://eneo-pay.xyz', 'Appelez le 677 12 34 56', 'Composez *126*1# pour vérifier', 'voir www.example.com'])
      expect(() => parseAlerts({ alerts: [{ ...ok, body: { ...ok.body, fr: bad } }] })).toThrow(/link, a phone number or a code/);
  });
  it('refuses missing languages, long texts, bad dates, duplicates and too many alerts', () => {
    expect(() => parseAlerts({ alerts: [{ ...ok, title: { fr: 'x' } }] })).toThrow();
    expect(() => parseAlerts({ alerts: [{ ...ok, title: { ...ok.title, en: 'x'.repeat(61) } }] })).toThrow(/60/);
    expect(() => parseAlerts({ alerts: [{ ...ok, expires: '2026-11-01' }] })).toThrow(/before/);
    expect(() => parseAlerts({ alerts: [ok, ok] })).toThrow(/twice/);
    expect(() => parseAlerts({ alerts: Array.from({ length: 21 }, (_, i) => ({ ...ok, id: `a${i}` })) })).toThrow(/20/);
    expect(() => validateUpdateFile('regions/CM/alerts.json', enc({ alerts: 'no' }))).toThrow();
  });
});
