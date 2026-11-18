import { describe, expect, it } from 'vitest';
import { analyze } from '../src/index.js';
import { lexicons, msg, region } from './helpers.js';

const card = (t: string) => analyze(msg(t, { kind: 'name', value: 'Test' }, '2026-11-18'), { region, lexicons });

describe('which date the card gives', () => {
  it('a moved appointment gives the NEW date (and its time), never the old one', async () => {
    const fr = await card('Hôpital: Votre rendez-vous du 20/11/2026 est reporté au 27/11/2026 à 10h.');
    expect(fr.deadline?.value).toBe('2026-11-27');
    expect(fr.deadlineTime?.value).toBe('10:00');
    const en = await card('Your appointment of 20 November 2026 has been moved to 25 November 2026 at 9:00.');
    expect(en.deadline?.value).toBe('2026-11-25');
    expect((await card('Réunion du 21/11/2026 décalée au 28/11/2026.')).deadline?.value).toBe('2026-11-28');
  });
  it('"jusqu au" written without apostrophe is a deadline', async () => {
    expect((await card('Résultats affichés le 20/11/2026. Recours possible jusqu au 30/11/2026.')).deadline?.value).toBe('2026-11-30');
  });
  it('issue dates, periods and receipts do not win over the due date', async () => {
    expect((await card('ENEO: Facture du 01/11/2026, période du 01/10/2026 au 31/10/2026. Montant 15 000 FCFA à payer avant le 30/11/2026.')).deadline?.value).toBe('2026-11-30');
    expect((await card('Date d émission: 10/11/2026. Date limite de paiement: 10/12/2026. Montant: 8 000 FCFA.')).deadline?.value).toBe('2026-12-10');
    expect((await card('Le paiement reçu le 12/11/2026 a été enregistré. Prochaine échéance: 12/12/2026.')).deadline?.value).toBe('2026-12-12');
  });
});
