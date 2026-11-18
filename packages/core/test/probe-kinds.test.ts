import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

/** Words with two meanings in French: "retrait" (cash withdrawal or collecting a document), "pension" (boarding fees or a retirement pension). */
const read = (t: string, v: string) => analyze(msg(t, { kind: 'name', value: v }, '2026-11-18'), { region, lexicons });

describe('ambiguous words and notices', () => {
  it('collecting a document at the town hall is not mobile money', async () => {
    const c = await read("Mairie de Douala 3e: Les cartes d'électeur sont disponibles. Retrait au bureau de la mairie du lundi au vendredi.", 'Mairie Douala 3');
    expect(c.understanding.kind).toBe('administrative');
  });
  it('a CNPS retirement pension is not school fees; boarding fees still are school', async () => {
    const cnps = await read('CNPS: Votre pension de retraite du mois de novembre est disponible. Présentez-vous au centre de Yaoundé avec votre carte.', 'CNPS');
    expect(cnps.understanding.kind).toBe('administrative');
    const school = await read('Collège Démo: les frais de pension du 2e trimestre, 60 000 FCFA, sont à payer avant le 30/11/2026.', 'Collège Démo');
    expect(school.understanding.kind).toBe('school');
  });
  it('a planned power interruption asks for nothing', async () => {
    const c = await read('ENEO: En raison de travaux, une interruption de fourniture est prévue le 21/11/2026 de 8h à 17h à Biyem-Assi. Nous nous excusons pour la gêne.', 'ENEO');
    expect(c.understanding.action).toBe('nothing');
    expect(c.understanding.urgency).toBe('info');
  });
  it('a real mobile money withdrawal is still mobile money', async () => {
    const c = await read("Retrait d'argent de 20 000 FCFA effectué avec succès. Nouveau solde: 5 000 FCFA.", 'MTN MoMo');
    expect(c.understanding.kind).toBe('mobile_money');
  });
  it('a "you sent" mobile money receipt asks for nothing', async () => {
    for (const [t, v] of [
      ['Orange Money: Vous avez envoyé 10 000 FCFA à JEAN (699887766). Frais 100 FCFA. Solde 23 400 FCFA.', 'Orange Money'],
      ['MTN MoMo: You have sent 5,000 FCFA to MARY (677112233). Fee 50 FCFA. New balance 12,000 FCFA.', 'MTN MoMo'],
    ] as const) {
      const c = await read(t, v);
      expect(c.understanding.action).toBe('nothing');
      expect(c.scam.level).toBe('no_signs');
    }
  });
  it('a court summons says when to be there, with the time', async () => {
    const c = await analyze(msg("TRIBUNAL DE GRANDE INSTANCE DU MFOUNDI\nCITATION A COMPARAITRE\nVous etes cite a comparaitre a l'audience du 03/12/2026 a 8h30.", undefined, '2026-11-18'), { region, lexicons });
    expect(c.understanding.action).toBe('go_to_place');
    expect(c.deadlineTime?.value).toBe('08:30');
  });
});
