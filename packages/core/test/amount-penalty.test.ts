import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

const amountOf = async (t: string) => (await analyze(msg(t, { kind: 'name', value: 'Test' }, '2026-11-18'), { region, lexicons })).amount?.value.amount;

describe('a penalty is never the amount to pay', () => {
  it('picks the bill, not the late fee next to the deadline', async () => {
    expect(await amountOf('CAMWATER: Consommation 12 m3. Montant: 7 200 FCFA. Pénalité de retard 720 FCFA si paiement après le 05/12/2026.')).toBe(7200);
    expect(await amountOf('Taxe communale 2026: montant dû 12 000 FCFA. Majoration de 10% (1 200 FCFA) après le 31/12/2026.')).toBe(12000);
    expect(await amountOf('Your loan instalment of 25,000 FCFA is due on 30/11/2026. Late payment penalty: 2,500 FCFA.')).toBe(25000);
  });
  it('a message about the penalty alone still shows it', async () => {
    expect(await amountOf('Pénalité de retard: 2 500 FCFA à payer avant le 30/11/2026.')).toBe(2500);
  });
  it('instalments and totals keep working', async () => {
    expect(await amountOf('ENEO: Facture de 18 450 FCFA. Ancien solde impayé: 6 000 FCFA. Total à payer: 24 450 FCFA avant le 30/11/2026.')).toBe(24450);
    expect(await amountOf('Frais de scolarité: 1ère tranche 40 000 FCFA (payée), 2ème tranche 40 000 FCFA à payer avant le 15/12/2026. Total annuel 95 000 FCFA.')).toBe(40000);
  });
  it('an annual total is not the amount due now (photo benchmark pages 14, 16, 17)', async () => {
    expect(await amountOf('Total annuel : 100 000 FCFA. 1ère tranche : 40 000 FCFA à payer avant le 15/12/2026.')).toBe(40000);
    expect(await amountOf('School fees: annual total 90,000 FCFA. First instalment 30,000 FCFA due by 30/11/2026.')).toBe(30000);
  });
  it('only the annual total legible: no amount rather than a wrong one', async () => {
    expect(await amountOf('Frais de scolarité de votre enfant, à régler avant le 15/12/2026. Total annuel : 70 000 FCFA.')).toBeUndefined();
  });
  it('an annual total in the deadline clause is the amount', async () => {
    expect(await amountOf('Total annuel de 70 000 FCFA à payer avant le 15/12/2026.')).toBe(70000);
  });
  it('an ordinal after a label is not an amount ("Frais: 1ère tranche")', async () => {
    const { extractFacts } = await import('../src/index.js');
    const { ctx } = await import('./helpers.js');
    const f = extractFacts('Frais de scolarité: 1ère tranche 40 000 FCFA (payée), 2ème tranche 40 000 FCFA à payer.', ctx);
    expect(f.amounts.map((a) => a.value.amount)).toEqual([40000, 40000]);
  });
});
