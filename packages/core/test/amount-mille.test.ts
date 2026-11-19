import { describe, expect, it } from 'vitest';
import { analyze, assessScam, extractFacts } from '../src/index.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const amounts = (t: string) => extractFacts(t, ctx).amounts.map((a) => a.value.amount);

describe('"5 mille": amounts in thousands, as written in SMS', () => {
  it('reads N mille (with or without a currency) as N 000', () => {
    expect(amounts('envoie 5 mille stp')).toEqual([5000]);
    expect(amounts('Le loyer est de 30 mille FCFA')).toEqual([30000]);
    expect(amounts('frais: 2,5 milles francs')).toEqual([2500]);
  });
  it('keeps the original text for "show me where"', () => {
    expect(extractFacts('envoie 5 mille stp', ctx).amounts[0]?.raw).toBe('5 mille');
  });
  it('never a year, a long number or a word without digits', () => {
    expect(amounts('en 2026 mille personnes')).toEqual([]);
    expect(amounts('Mille mercis pour votre aide')).toEqual([]);
    expect(amounts('dossier 1245 mille')).toEqual([]);
  });
  it('ordinary amounts are unchanged', () => {
    expect(amounts('Montant 18 450 FCFA')).toEqual([18450]);
    expect(amounts('15 000 francs CFA')).toEqual([15000]);
  });
  it('a scam that says "mille" is caught', async () => {
    const t = 'Maman c est moi, mon téléphone est gâté. Envoie-moi 15 mille sur ce numéro urgent stp.';
    const r = assessScam(msg(t, { kind: 'number', value: '+237690554433' }), extractFacts(t, ctx), region, lexicons);
    expect(r.signals).toContain('pay_to_personal_number');
  });
  it('a card shows the amount', async () => {
    const c = await analyze(msg('Rappel: votre cotisation de 10 mille FCFA est à payer avant le 30/11/2026.', { kind: 'name', value: 'Tontine' }, '2026-11-19'), { region, lexicons });
    expect(c.amount?.value.amount).toBe(10000);
  });
});
