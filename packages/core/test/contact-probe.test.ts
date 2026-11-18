import { describe, expect, it } from 'vitest';
import { analyze, buildSpeechPlan } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

const card = (t: string, sender: Parameters<typeof msg>[1]) => analyze(msg(t, sender, '2026-11-18'), { region, lexicons });
const keys = async (t: string, sender: Parameters<typeof msg>[1]) =>
  buildSpeechPlan(await card(t, sender), { today: '2026-11-18' }).sections.flatMap((s) => s.utterances.map((u) => u.key));

describe('short bills and callback lures', () => {
  it('"Facture 15 000 FCFA avant le ..." is a bill to pay (a full card, not facts only)', async () => {
    const c = await card('ENEO: Facture 15 000 FCFA avant le 30/11/2026. Paiement MoMo au 677 00 11 22. Service client: 699 88 77 66.', { kind: 'name', value: 'ENEO' });
    expect(c.mode).toBe('full');
    expect(c.understanding.action).toBe('pay');
    expect(c.amount?.value.amount).toBe(15000);
    // Safety rule kept: a message that only claims to be ENEO never hands out a personal mobile number as its help line.
    expect(c.contactPhone).toBeUndefined();
  });
  it('a receipt for a bill still asks for nothing', async () => {
    const c = await card('ENEO: Paiement reçu pour la facture n° 4512339. Merci.', { kind: 'name', value: 'ENEO' });
    expect(c.understanding.action).not.toBe('pay');
  });
  it('"call me back urgently" from an unknown mobile number gets a warning', async () => {
    const c = await card('Hello, call me back urgently on 650 12 34 56, it is about your parcel.', { kind: 'number', value: '+237650123456' });
    expect(c.scam.level).not.toBe('no_signs');
    expect(await keys('Hello, call me back urgently on 650 12 34 56, it is about your parcel.', { kind: 'number', value: '+237650123456' })).not.toContain('help.call');
  });
});
