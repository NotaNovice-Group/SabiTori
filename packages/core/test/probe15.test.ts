import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

const NAME = (v: string) => ({ kind: 'name' as const, value: v });
const card = (t: string, s: string) => analyze(msg(t, NAME(s), '2026-11-19'), { region, lexicons });

describe('probe 15: public-service messages', () => {
  it('"Amenez vos enfants au centre de santé" means go there', async () => {
    const c = await card('MINSANTE: Campagne de vaccination contre la polio du 25 au 28 novembre 2026. Amenez vos enfants de 0 à 5 ans au centre de santé le plus proche. Gratuit.', 'MINSANTE');
    expect(c.understanding.action).toBe('go_to_place');
    expect(c.scam.level).toBe('no_signs');
  });
  it('"Présence des parents obligatoire" means go there, at the time given', async () => {
    const c = await card("Lycée Bilingue d'Essos: Les bulletins du premier trimestre seront remis aux parents le samedi 12 décembre 2026 à 9h. Présence des parents obligatoire.", 'LBE');
    expect(c.understanding.action).toBe('go_to_place');
    expect(c.deadline?.value).toBe('2026-12-12');
    expect(c.deadlineTime?.value).toBe('09:00');
  });
  it('a start date close by ("à partir du 25 novembre") is not urgent', async () => {
    const c = await card('CNPS: Votre pension du mois de novembre de 48 500 FCFA est disponible. Retrait au guichet à partir du 25 novembre 2026 avec votre carte.', 'CNPS');
    expect(c.deadlineFrom).toBe(true);
    expect(c.understanding.urgency).not.toBe('urgent');
    expect(c.amount?.value.amount).toBe(48500);
  });
  it('a real deadline close by stays urgent', async () => {
    const c = await card('DGI: Votre impôt libératoire 2026 de 15 000 FCFA est à payer avant le 24 novembre 2026. Pénalité de 10% après cette date.', 'DGI');
    expect(c.understanding.urgency).toBe('urgent');
  });
  it('the other public-service messages read as before', async () => {
    const court = await card("Tribunal de Première Instance de Douala-Bonanjo: vous êtes convoqué(e) le 3 décembre 2026 à 8h30 pour l'affaire n° 1245/2026. Présence obligatoire.", 'TPI Douala');
    expect(court.understanding.action).toBe('go_to_place');
    expect(court.deadlineTime?.value).toBe('08:30');
    const tax = await card('DGI: Votre impôt libératoire 2026 de 15 000 FCFA est à payer avant le 15 décembre 2026 au centre des impôts ou par mobile money. Pénalité de 10% après cette date.', 'DGI');
    expect(tax.amount?.value.amount).toBe(15000);
    expect(tax.understanding.action).toBe('pay');
  });
});
