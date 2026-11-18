import { describe, expect, it } from 'vitest';
import { analyze, assessScam, extractFacts } from '../src/index.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const read = (t: string, s: Parameters<typeof msg>[1]) => analyze(msg(t, s, '2026-11-18'), { region, lexicons });

describe('French written the SMS way', () => {
  it('"rdv ... svp venir" is a place to go, with the time', async () => {
    const c = await read('rdv au centre de sante le 24/11/2026 a 10h pr la vaccination de votre enfant. svp venir avec le carnet', { kind: 'name', value: 'CS Bonamoussadi' });
    expect(c.understanding.action).toBe('go_to_place');
    expect(c.deadlineTime?.value).toBe('10:00');
  });
  it('a landlord reminder from a personal number asking for money to that number stays flagged (known trade-off)', async () => {
    // Real landlords and scammers write the same thing ("pay X, my number is 677..."); a missed scam costs more than a
    // false alarm, so this stays a warning. Treating "Tel" as a contact word was tried and let the scam below through.
    const c = await read('Mr le locataire, le loyer de 30000f doit etre paye avant le 30/11/2026. Le bailleur. Tel 677123456', { kind: 'number', value: '+237677123456' });
    expect(c.scam.level).not.toBe('no_signs');
  });
  it('but money sent to a number is still caught, whatever word comes before it', () => {
    for (const t of ['Envoyez 10 000 FCFA de frais au 677 12 34 56 pour recevoir votre lot.', 'Félicitations! Envoyez 10 000 FCFA de frais. Tel 677 12 34 56.']) {
      const r = assessScam(msg(t, { kind: 'number', value: '+237677123456' }), extractFacts(t, ctx), region, lexicons);
      expect(r.level, t).not.toBe('no_signs');
    }
  });
  it('a power cut "pr travaux ... desole pr la gene" asks for nothing', async () => {
    const c = await read('URGENT: coupure de courant demain de 8h a 16h a Mendong pr travaux. Desole pr la gene', { kind: 'name', value: 'ENEO' });
    expect(c.understanding.action).toBe('nothing');
  });
});
