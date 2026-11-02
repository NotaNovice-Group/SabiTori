import { describe, expect, it } from 'vitest';
import { analyze, buildSpeechPlan, CONFIDENCE_THRESHOLD, extractFacts, matchSender, type Card } from '../src/index.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const run = (text: string, sender?: Parameters<typeof msg>[1], receivedAt = '2026-10-31') =>
  analyze(msg(text, sender, receivedAt), { region, lexicons });
const keys = (c: Card) => buildSpeechPlan(c).sections.flatMap((s) => s.utterances.map((u) => u.key));
const facts = (text: string, receivedAt = '2026-10-31') => extractFacts(text, { ...ctx, receivedAt });
const amounts = (t: string) => facts(t).amounts.map((a) => a.value.amount);
const phones = (t: string) => facts(t).phones.map((p) => p.value);

/* 1 */
describe('1. a scammer number is never the help line', () => {
  const scams = [
    'Felicitations! Vous avez gagne 500 000 FCFA. Appelez le 677 12 34 56.',
    "Salut c'est ton frère, je suis en garde à vue, envoie 20 000 F sur le 677 12 34 56 vite.",
    'Urgent: votre fils est à l\'hôpital. Envoyez 50 000 FCFA au 677 12 34 56 pour les soins.',
    'Votre colis est bloqué. Payez 12 500 FCFA au 677 12 34 56.',
    'Pay 5,000 FCFA to 677123456 to get your 100,000 FCFA grant from the Ministry.',
    'Transfert de 50 000 FCFA en attente. Pour confirmer, envoyez votre code au 677123456.',
    'ENEO: Payez 15 000 FCFA au 677 12 34 56 (MoMo) avant le 15/11/2026.',
  ];
  for (const t of scams)
    it(`likely_scam, no help.call: ${t.slice(0, 50)}`, async () => {
      const c = await run(t);
      expect(c.scam.level).toBe('likely_scam');
      expect(c.contactPhone).toBeUndefined();
      expect(keys(c)).not.toContain('help.call');
    });

  it('pay_to_personal_number is the structural signal', async () => {
    const c = await run('Votre colis est bloqué. Payez 12 500 FCFA au 677 12 34 56.');
    expect(c.scam.signals).toContain('pay_to_personal_number');
  });
  it('a bill that only says "call" keeps its number, a number after the amount does not', async () => {
    const ok = await run('Hôpital Laquintinie: RDV le 4 novembre 2026. Pour toute question appelez le 233 42 00 11.');
    expect(ok.contactPhone?.value).toBe('+237233420011');
    const after = await run('Rappel: consultation le 4 novembre 2026, frais 5 000 FCFA. Info 233 42 00 11.');
    expect(after.contactPhone).toBeUndefined();
  });
  it('bare "au" is not a contact word', async () => {
    const c = await run('Hôpital: réunion au 699 88 77 66 le 05/11/2026. Pour toute question appelez le 233 42 00 11.');
    expect(c.contactPhone?.value).toBe('+237233420011');
  });
  it('facts_only never sets contactPhone nor speaks help.call', async () => {
    const c = await analyze(msg('Appelez le 233 42 00 11 pour toute question sur votre dossier.'), {
      region,
      lexicons,
      classifier: {
        id: 't',
        classify: async () => ({ kind: 'other', action: 'unclear', urgency: 'info', confidence: 0.1, producedBy: 't' }),
      },
    });
    expect(c.mode).toBe('facts_only');
    expect(c.contactPhone).toBeUndefined();
    expect(keys(c)).not.toContain('help.call');
  });
});

describe('1b. no false alarm on a genuine bill with a customer-service number', () => {
  it('"paiement" is a noun, not a pay verb', async () => {
    const c = await run(
      "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 12 novembre 2026. Service client: 677 00 12 34.",
      { kind: 'name', value: 'ENEO' },
    );
    expect(c.scam.signals).not.toContain('pay_to_personal_number');
    expect(c.scam.level).toBe('no_signs');
  });
});

describe('1c. genuine notices with an info number are not payment requests', () => {
  it('school fees to pay at the bursar, info number in the next sentence', async () => {
    const c = await run(
      "Lycée Bilingue: La deuxième tranche des frais de scolarité, 45 000 FCFA, est à payer avant le 20 novembre 2026 au bureau de l'économe. Info: 699 12 12 12.",
      { kind: 'name', value: 'Lycée Bilingue' },
    );
    expect(c.scam.signals).not.toContain('pay_to_personal_number');
    expect(c.scam.level).toBe('no_signs');
  });
});

/* 2 */
describe('2. weekday next to an explicit date', () => {
  it('fr', async () => {
    const c = await run('Hôpital: RDV le lundi 9 novembre 2026 à 8h.');
    expect(c.deadline?.value).toBe('2026-11-09');
    expect(facts('Hôpital: RDV le lundi 9 novembre 2026 à 8h.').dates.map((d) => d.value)).toEqual(['2026-11-09']);
  });
  it('en', async () => {
    const c = await run('Hospital: appointment on Monday 9 November 2026');
    expect(c.deadline?.value).toBe('2026-11-09');
  });
  it('a lone weekday still works', () => {
    expect(facts('Payez avant vendredi').dates.map((d) => d.value)).toEqual(['2026-11-06']);
  });
});

/* 3 */
describe('3. year-less dates', () => {
  it('a recent past date stays in the past', async () => {
    const c = await run('Facture ENEO 15 000 FCFA à régler avant le 10/10 pour éviter la coupure.');
    expect(c.deadline?.value).toBe('2026-10-10');
    expect(keys(c)).toContain('deadline.passed');
  });
  it('20/12 received 28 Dec', () => {
    expect(facts('à régler avant le 20/12', '2026-12-28').dates[0]?.value).toBe('2026-12-20');
  });
  it('05/01 received 28 Dec is next year', () => {
    expect(facts('à régler avant le 05/01', '2026-12-28').dates[0]?.value).toBe('2027-01-05');
  });
  it('29/02 in a non-leap year is rejected', () => {
    expect(facts('à régler avant le 29/02').dates).toEqual([]);
    expect(facts('à régler avant le 29 février').dates).toEqual([]);
  });
});

/* 4 */
describe('4. phone gluing', () => {
  for (const t of ['RDV le 15 11 2026 677 12 34 56', 'N° 26 677 12 34 56', 'ID: 2026 677 12 34 56'])
    it(t, () => expect(phones(t)).toEqual(['+237677123456']));
  it('two phones in one run stay two', () => {
    expect(phones('677 12 34 56 699 88 77 66')).toEqual(['+237677123456', '+237699887766']);
  });
  it('a stray digit after the number is not part of it', () => {
    expect(phones('+237 677 12 34 56 7')).toEqual(['+237677123456']);
  });
  it('5000 FCFA 677123456 keeps the phone (item 11)', () => {
    const f = facts('5000 FCFA 677123456');
    expect(f.phones.map((p) => p.value)).toEqual(['+237677123456']);
    expect(f.amounts.map((a) => a.value.amount)).toEqual([5000]);
  });
});

/* 5 */
describe('5. OCR noise in amounts', () => {
  it('line break inside a group', () => {
    expect(amounts('Montant: 15 0\n00 FCFA')).toEqual([15000]);
    expect(amounts('Montant: 15\n000 FCFA')).toEqual([15000]);
  });
  it('letter glued before the numeral', () => {
    expect(amounts('V0tre facture ENE0 de l5 000 FCFA')).toEqual([]);
  });
  it('1 5 000 gives no amount', () => {
    expect(amounts('Montant 1 5 000 FCFA')).toEqual([]);
  });
  it('zero and leading-zero amounts are rejected', () => {
    expect(amounts('Montant: 0 FCFA')).toEqual([]);
    expect(amounts('Montant: 05000 FCFA')).toEqual([]);
    expect(amounts('Montant: 00 FCFA')).toEqual([]);
  });
  it('minor units are rejected, not rounded', () => {
    expect(amounts('Total: 15,50 FCFA')).toEqual([]);
  });
  it('normal amounts still work', () => {
    expect(amounts('Total: 15 000 FCFA, puis 2.500 F')).toEqual([15000, 2500]);
  });
});

/* 6 */
describe('6. asks_pin negation bypass', () => {
  for (const t of [
    'Never share your PIN with anyone, send your PIN to 677123456 for verification.',
    'MTN ne vous demandera jamais votre code PIN, envoyez votre code PIN au 677123456 pour vérifier.',
  ])
    it(t.slice(0, 40), async () => {
      const c = await run(t);
      expect(c.scam.level).toBe('likely_scam');
      expect(c.scam.signals).toContain('asks_pin');
    });
  it('a pure warning stays no_signs', async () => {
    const c = await run(
      'Vous avez reçu 25 000 FCFA de Jean Mballa. ID de transaction: 8821993. Ne communiquez jamais votre code secret.',
      { kind: 'name', value: 'MTN MoMo' },
    );
    expect(c.scam.signals).not.toContain('asks_pin');
    expect(c.scam.level).toBe('no_signs');
  });
  it('a warning with several secrets is not a hit', async () => {
    const c = await run('Never share your PIN, OTP or password with anyone.');
    expect(c.scam.signals).not.toContain('asks_pin');
  });
});

/* 7 */
describe('7. USSD instructions', () => {
  const likely = [
    'MTN MoMo: Votre compte sera bloqué. Pour le débloquer, composez *126*1*677123456*5000# maintenant.',
    'Your MoMo account needs verification. Dial *126# and enter the code we sent you. MTN',
    'MTN: Vous avez reçu un bonus de 5000 FCFA. Composez *126*2*677123456# pour le retirer.',
    'Pour recevoir votre transfert de 25 000 FCFA, tapez votre code de retrait suivi de #. Merci MTN MoMo',
  ];
  for (const t of likely)
    it(`likely_scam: ${t.slice(0, 45)}`, async () => {
      const c = await run(t);
      expect(c.scam.level).toBe('likely_scam');
    });
  it('code with a phone or amount is ussd_instruction', async () => {
    const c = await run('Composez *126*2*677123456# pour le retirer.');
    expect(c.scam.signals).toContain('ussd_instruction');
    expect(c.scam.level).toBe('likely_scam');
  });
  it('a plain dial instruction is only caution', async () => {
    const c = await run('Pour consulter votre solde composez *126#.');
    expect(c.scam.signals).toEqual(['ussd_instruction']);
    expect(c.scam.level).toBe('caution');
  });
  it('"Composez le 126" and "Envoyer au 237" are not ussd codes', () => {
    expect(facts('Composez le 126').ussdCodes).toEqual([]);
    expect(facts('Envoyer au 237').ussdCodes).toEqual([]);
  });
});

/* 8 */
describe('8. caution in the speech plan', () => {
  it('no call/reply action, no unverified phone', async () => {
    const c = await run('Pour toute question appelez le 233 42 00 11.', undefined);
    const forced: Card = {
      ...c,
      scam: { level: 'caution', signals: ['link'] },
      understanding: { ...c.understanding, action: 'call' },
      contactPhone: c.facts.phones[0] ?? undefined,
    } as Card;
    const k = keys(forced);
    expect(k).not.toContain('action.call');
    expect(k).not.toContain('help.call');
    expect(keys({ ...forced, understanding: { ...forced.understanding, action: 'reply' } })).not.toContain('action.reply');
  });
  it('caution + claimed sender + amount + number: no money or deadline', async () => {
    const c = await run('ENEO: facture de 15 000 FCFA à régler avant le 15/11/2026. Appelez le 233 42 00 11.');
    expect(c.scam.level).toBe('caution');
    const k = keys(c);
    expect(k).not.toContain('money.amount');
    expect(k).not.toContain('deadline.by');
    expect(k).not.toContain('help.call');
  });
});

/* 9 */
describe('9. sender aliases', () => {
  it('a first name Momo is not MTN MoMo', () => {
    const r = matchSender(msg('Momo Jean vous invite à la réunion des parents le 05/11/2026.'), region, lexicons);
    expect(r.claimedSenderId).toBeUndefined();
  });
  it('the brand token MoMo still claims', () => {
    expect(matchSender(msg('Votre compte MoMo sera bloqué.'), region, lexicons).claimedSenderId).toBe('mtn-momo');
  });
  it('payment channels after the bill company are not the sender', async () => {
    const t = 'Payez votre facture ENEO via Orange Money ou MTN MoMo avant le 15/11/2026. Montant: 15 000 FCFA.';
    expect(matchSender(msg(t), region, lexicons).claimedSenderId).toBe('eneo');
    const c = await run(t);
    expect(c.understanding.kind).toBe('electricity_bill');
    expect(c.amount?.value.amount).toBe(15000);
  });
  it('a channel list is not the sender: alias after alias + ou', () => {
    const t = 'Payez avec Orange Money ou MTN MoMo avant le 15/11/2026.';
    expect(matchSender(msg(t), region, lexicons).claimedSenderId).toBeUndefined();
  });
});

/* 10 */
describe('10. lexicon gaps', () => {
  for (const t of [
    'Orange Money: Votre compte a ete suspendu. Cliquez http://x.co/a pour reactiver.',
    'Cher client, validez la transaction en saisissant les 4 chiffres secrets de votre compte MoMo.',
    "Bonjour, je suis l'agent MTN. Dicte-moi ton code momo pour débloquer ton compte.",
    'Your account has been blocked. Tell me your withdrawal code at http://x.co/a',
  ])
    it(`likely_scam: ${t.slice(0, 45)}`, async () => {
      expect((await run(t)).scam.level).toBe('likely_scam');
    });
});

/* 11 */
describe('11. short codes', () => {
  it('numéro vert 8000', () => {
    expect(facts('Appelez le numéro vert 8000').ussdCodes.map((u) => u.value)).toEqual(['8000']);
  });
  it('text STOP to 8080', () => {
    expect(facts('text STOP to 8080').ussdCodes.map((u) => u.value)).toEqual(['8080']);
  });
});

/* bill action (orchestrator follow-up) */
describe('bills that ask to pay read as action pay', () => {
  const eneo =
    "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 9 novembre 2026. Évitez la coupure. Service client: 677 00 12 34.";
  it('the practice ENEO example', async () => {
    const c = await run(eneo, { kind: 'name', value: 'ENEO' });
    expect(c.understanding.kind).toBe('electricity_bill');
    expect(c.understanding.action).toBe('pay');
    expect(c.understanding.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(c.mode).toBe('full');
    expect(c.amount?.value.amount).toBe(18450);
    expect(c.deadline?.value).toBe('2026-11-09');
  });
  for (const t of [
    'ENEO: Veuillez régler votre facture avant le 15/11/2026.',
    'CAMWATER: facture à régler avant le 15/11/2026.',
    'ENEO: Réglez votre facture avant le 15/11/2026.',
    'CAMWATER: Payez votre facture avant le 15/11/2026.',
    'ENEO: Please pay your bill before 15/11/2026.',
    'CAMWATER: Please settle your water bill before 15/11/2026.',
  ])
    it(t, async () => {
      const c = await run(t);
      expect(c.understanding.action).toBe('pay');
      expect(c.understanding.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    });
});

/* 12 */
describe('12. performance', () => {
  it('analyze stays fast on a long message', async () => {
    const t = 'Votre facture ENEO de 15 000 FCFA. Veuillez régler avant le 15/11/2026. '.repeat(40);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) await run(t);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe('orchestrator: impersonation help lines and urgency calibration', () => {
  const bill =
    "ENEO: Cher client, votre facture N° 0451233987 d'un montant de 18 450 FCFA est disponible. " +
    'Date limite de paiement: 12/11/2026. Évitez la coupure. Pour toute question appelez le 677 00 12 34 56.';

  it('never offers a personal mobile number as the help line of a claimed, unverified company', async () => {
    const c = await run(bill);
    expect(c.contactPhone).toBeUndefined();
    expect(keys(c)).not.toContain('help.call');
  });

  it('still offers a landline from a claimed company when nothing looks wrong', async () => {
    const c = await run(bill.replace('677 00 12 34 56', '233 42 00 11'));
    if (c.mode === 'full' && c.scam.level === 'no_signs') expect(c.contactPhone?.value).toBe('+237233420011');
  });

  it('a bill due in 12 days with a cut-off warning is "soon", not "urgent"', async () => {
    const c = await run(bill);
    expect(c.understanding.urgency).not.toBe('urgent');
  });

  it('the same bill due in 2 days stays urgent when the classifier says so', async () => {
    const c = await run(bill, undefined, '2026-11-10');
    if (c.understanding.urgency !== 'info') expect(['urgent', 'soon']).toContain(c.understanding.urgency);
  });
});
