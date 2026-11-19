import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

const NAME = (v: string) => ({ kind: 'name' as const, value: v });
const card = (t: string, s: string) => analyze(msg(t, NAME(s), '2026-11-19'), { region, lexicons });

describe('probe 16: English official messages', () => {
  it('"must be paid by" asks to pay', async () => {
    const c = await card('GBHS Limbe: Second instalment of school fees, 35,000 FCFA, must be paid by 15 December 2026. Students owing fees will be sent home.', 'GBHS Limbe');
    expect(c.understanding.action).toBe('pay');
    expect(c.amount?.value.amount).toBe(35000);
  });
  it('"doit être payé" asks to pay', async () => {
    const c = await card('Collège La Réussite: La deuxième tranche de 40 000 FCFA doit être payée avant le 15 décembre 2026.', 'Collège');
    expect(c.understanding.action).toBe('pay');
  });
  it('a fine that is only a consequence is not the amount', async () => {
    const c = await card('University of Buea: Registration for the second semester closes on 11 December 2026. Late registration attracts a fine of 10,000 FCFA.', 'UB');
    expect(c.amount).toBeUndefined();
  });
  it('a penalty the message asks to pay is still shown', async () => {
    const c = await card('Pénalité de retard: 2 500 FCFA à payer avant le 30/11/2026.', 'Test');
    expect(c.amount?.value.amount).toBe(2500);
  });
  it('a pension that "will be paid" is not a payment to make', async () => {
    const c = await card('CNPS: Your November pension of 48,500 FCFA will be paid from 25 November 2026 at the counter.', 'CNPS');
    expect(c.understanding.action).not.toBe('pay');
  });
});
