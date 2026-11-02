import { describe, expect, it } from 'vitest';
import {
  analyze,
  assessScam,
  buildCard,
  buildSpeechPlan,
  extractFacts,
  guardUnderstanding,
  matchSender,
  type Card,
  type Classifier,
  type RegionConfig,
  type Understanding,
} from '../src/index.js';
import { termSource, findTerms } from '../src/text.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const run = (text: string, sender?: Parameters<typeof msg>[1], receivedAt = '2026-10-31', reg: RegionConfig = region) =>
  analyze(msg(text, sender, receivedAt), { region: reg, lexicons });
const keys = (c: Card) => buildSpeechPlan(c).sections.flatMap((s) => s.utterances.map((u) => u.key));
const facts = (text: string, receivedAt = '2026-10-31') => extractFacts(text, { ...ctx, receivedAt });
const amounts = (t: string) => facts(t).amounts.map((a) => a.value.amount);

/** The region with two senders marked verified, as a maintainer would after confirming them. */
function verifiedRegion(): RegionConfig {
  const r = JSON.parse(JSON.stringify(region)) as RegionConfig;
  for (const o of r.officialSenders) {
    if (o.id === 'mtn-momo') Object.assign(o, { verified: true, smsSenderIds: ['MobileMoney'] });
    if (o.id === 'eneo') Object.assign(o, { verified: true, smsSenderIds: ['ENEO'], helpline: '8010', shortCodes: ['8010'] });
    if (o.id === 'camwater') Object.assign(o, { verified: true, smsSenderIds: ['CAMWATER'], helpline: '233420011' });
  }
  return r;
}

/* 1 */
describe('1. a verified sender does not make a personal number safe', () => {
  const vr = verifiedRegion();
  it('verified MobileMoney asking a fee to a mobile number is likely_scam with no help.call', async () => {
    const c = await run(
      'MobileMoney: Vous avez reçu 150 000 FCFA. Pour retirer, envoyez 5 000 FCFA de frais au 677123456.',
      { kind: 'name', value: 'MobileMoney' },
      '2026-10-31',
      vr,
    );
    expect(c.sender.verified).toBe(true);
    expect(c.scam.level).toBe('likely_scam');
    expect(c.scam.signals).toContain('pay_to_personal_number');
    expect(keys(c)).not.toContain('help.call');
  });
  it('verified ENEO: "Payez ... au 677 12 34 56 ... Appelez le 8010" never speaks 677', async () => {
    const c = await run(
      'ENEO: Payez 15 000 FCFA au 677 12 34 56 avant le 15/11/2026. Appelez le 8010',
      { kind: 'name', value: 'ENEO' },
      '2026-10-31',
      vr,
    );
    expect(c.contactPhone?.value).not.toBe('+237677123456');
    expect(JSON.stringify(buildSpeechPlan(c))).not.toContain('677');
  });
  it('a verified sender with a prize and a personal number is a prize_fee', async () => {
    const c = await run('MobileMoney: Félicitations, vous avez gagné 500 000 FCFA. Appelez le 677123456.', { kind: 'name', value: 'MobileMoney' }, '2026-10-31', vr);
    expect(c.scam.signals).toContain('prize_fee');
    expect(c.scam.level).toBe('likely_scam');
  });
  it("a verified sender's own helpline is still the help line", async () => {
    const c = await run('CAMWATER: Votre facture de 8 400 FCFA est disponible. Pour toute question appelez le 233 42 00 11.', { kind: 'name', value: 'CAMWATER' }, '2026-10-31', vr);
    expect(c.scam.level).toBe('no_signs');
    expect(c.contactPhone?.value).toBe('+237233420011');
    expect(keys(c)).toContain('help.call');
  });
  it('a verified sender may still name a non-payment mobile contact', async () => {
    const c = await run('ENEO: Votre agence est ouverte lundi. Contactez le 677 12 34 56 pour un rendez-vous.', { kind: 'name', value: 'ENEO' }, '2026-10-31', vr);
    expect(c.scam.level).not.toBe('likely_scam');
  });
});

/* 11 */
describe('11. a verified sender keeps claimedSenderId', () => {
  it('matchSender returns the verified company as claimed too', () => {
    const vr = verifiedRegion();
    const m = matchSender(msg('Votre facture.', { kind: 'name', value: 'ENEO' }), vr, lexicons);
    expect(m.sender.verified).toBe(true);
    expect(m.claimedSenderId).toBe('eneo');
  });
  it('an unverified name still gives a claimed id and no verification', () => {
    const m = matchSender(msg('ENEO: facture'), region, lexicons);
    expect(m.sender.verified).toBe(false);
    expect(m.claimedSenderId).toBe('eneo');
  });
  it('a verified sender is not flagged as a mismatch', () => {
    const vr = verifiedRegion();
    const s = assessScam(msg('ENEO: facture de 5 000 FCFA.', { kind: 'name', value: 'ENEO' }), facts('ENEO: facture de 5 000 FCFA.'), vr, lexicons);
    expect(s.signals).not.toContain('sender_mismatch');
  });
});

/* 2 */
describe('2. phone extraction and URL scanning are linear', () => {
  const cases: [string, number][] = [
    ['677 12 34 56 ', 770],
    ['12 345 ', 1500],
    ['2026-11-15 ', 900],
    ['1 ', 5000],
    ['1.1.', 2500],
  ];
  for (const [unit, n] of cases)
    it(`'${unit}' x ${n} finishes in under 200 ms`, () => {
      const text = unit.repeat(n);
      extractFacts(text.slice(0, 200), ctx); // warm up the regex caches
      const t0 = performance.now();
      extractFacts(text, ctx);
      expect(performance.now() - t0).toBeLessThan(200);
    });
  it('a long run still finds the phone at its end, and the longest window wins', () => {
    expect(facts('1 '.repeat(3000) + '+237 677 12 34 56').phones.map((p) => p.value)).toEqual(['+237677123456']);
    expect(facts('677 12 34 56').phones.map((p) => p.raw)).toEqual(['677 12 34 56']);
    expect(facts('Appelez le +237 6 77 12 34 56').phones.map((p) => p.value)).toEqual(['+237677123456']);
  });
});

/* 3 */
describe('3. a genuine operator SMS with balance / renewal codes is not likely_scam', () => {
  const genuine = [
    'Vous avez reçu 15 000 FCFA de JEAN MBALLA (677123456). ID de transaction: 55412099. Nouveau solde: 23 450 FCFA. Composez *126# pour consulter votre solde.',
    'MTN: Votre forfait 1Go expire dans 2 jours. Rechargez via *126# ou composez *123# pour renouveler. Service client: 8787.',
    'Dear customer, your 1GB bundle expires today. Dial *123# to renew. MTN',
  ];
  for (const t of genuine)
    it(`no_signs or caution: ${t.slice(0, 50)}`, async () => {
      const c = await run(t);
      expect(c.scam.level === 'no_signs' || c.scam.level === 'caution').toBe(true);
      expect(c.scam.signals).not.toContain('asks_to_call_number');
      expect(c.scam.signals).not.toContain('ussd_instruction');
    });
  it('the number that names who sent money is not "call this number"', () => {
    const t = 'Vous avez reçu 15 000 FCFA de JEAN MBALLA (677123456). Composez *126# pour consulter votre solde.';
    expect(assessScam(msg(t), facts(t), region, lexicons).signals).not.toContain('asks_to_call_number');
  });
  it("an official sender's own balanceCode is not a ussd_instruction", () => {
    const r = JSON.parse(JSON.stringify(region)) as RegionConfig;
    for (const o of r.officialSenders) if (o.id === 'mtn-momo') o.balanceCode = '*126*1*1#';
    const t = 'Pour votre solde composez *126*1*1# maintenant, merci MTN MoMo.';
    expect(assessScam(msg(t), facts(t), r, lexicons).signals).not.toContain('ussd_instruction');
    expect(assessScam(msg(t), facts(t), region, lexicons).signals).toContain('ussd_instruction');
  });
  it('a bare code with a money-purpose word, or a 4+ digit segment, stays a ussd_instruction', async () => {
    for (const t of [
      'Pour recevoir votre transfert composez *126# maintenant.',
      'Pour confirmer le retrait composez #150#.',
      'Composez *126*2*677123456# pour le retirer.',
      'MTN MoMo: pour débloquer votre compte composez *126*1*5000#.',
    ]) {
      const c = await run(t);
      expect(c.scam.signals, t).toContain('ussd_instruction');
    }
  });
  it('the existing money-USSD scams stay likely_scam', async () => {
    for (const t of [
      'MTN MoMo: Votre compte sera bloqué. Pour le débloquer, composez *126*1*677123456*5000# maintenant.',
      'Your MoMo account needs verification. Dial *126# and enter the code we sent you. MTN',
      'MTN: Vous avez reçu un bonus de 5000 FCFA. Composez *126*2*677123456# pour le retirer.',
    ])
      expect((await run(t)).scam.level, t).toBe('likely_scam');
  });
});

/* 4 */
describe('4. a learned classifier never contradicts the facts or weakens a warning', () => {
  const rulesU = (u: Partial<Understanding> = {}): Understanding => ({
    kind: 'school', action: 'pay', urgency: 'soon', confidence: 0.8, producedBy: 'rules@1', ...u,
  });
  const learnt = (u: Partial<Understanding>): Classifier => ({
    id: 'learnt@1',
    classify: async () => ({ kind: 'school', action: 'nothing', urgency: 'info', confidence: 0.9, producedBy: 'learnt@1', ...u }),
  });
  const PIDGIN = 'Your pikin school fees na 45 000 F, pay am before 20/11 for school. Call 233 42 00 11 for info.';
  const runWith = (text: string, classifier: Classifier, sender?: Parameters<typeof msg>[1], receivedAt = '2026-10-31') =>
    analyze(msg(text, sender, receivedAt), { region, lexicons, classifier });

  it('pidgin school fees: "nothing / info" from the classifier becomes pay / soon', async () => {
    const c = await runWith(PIDGIN, learnt({}));
    expect(c.understanding.action).toBe('pay');
    expect(c.understanding.urgency).not.toBe('info');
    expect(keys(c)).not.toContain('action.nothing');
    expect(keys(c)).not.toContain('urgency.info');
  });
  it('(a) nothing next to an amount near a pay verb keeps the rules action', async () => {
    const c = await runWith('Payez 5 000 FCFA au guichet de la mairie.', learnt({ kind: 'administrative' }));
    expect(c.understanding.action).not.toBe('nothing');
  });
  it('(a) a real receipt may stay "nothing"', async () => {
    const t = 'MTN MoMo: Vous avez reçu 5 000 FCFA de Mary. Nouveau solde: 21 000 FCFA.';
    const c = await runWith(t, learnt({ kind: 'mobile_money' }));
    expect(c.understanding.action).toBe('nothing');
  });
  it('(b) urgency is never below the date-derived one; a task due within 2 days is urgent', async () => {
    const c = await runWith('Votre facture ENEO de 24 500 FCFA. Payez avant le 02/11/2026.', learnt({ kind: 'electricity_bill', action: 'pay', urgency: 'info' }));
    expect(c.understanding.urgency).toBe('urgent');
    const d = await runWith('Rendez-vous à la mairie le 05/11/2026, apportez votre CNI.', learnt({ kind: 'administrative', action: 'go_to_place', urgency: 'info' }));
    expect(d.understanding.urgency).not.toBe('info');
  });
  it('(b) a deadline beyond 7 days is still at least soon, never urgent by the guard alone', async () => {
    const c = await runWith('Frais de scolarité 45 000 FCFA à payer avant le 15/12/2026.', learnt({ action: 'pay', urgency: 'info' }));
    expect(c.understanding.urgency).toBe('soon');
  });
  it('(b) new-08: CAMTEL échéance 02/11 received 31/10 under caution stays urgent', async () => {
    const t = 'CAMTEL Blue: votre abonnement fibre arrive à échéance le 02/11/2026. Renouvelez 25 000 FCFA via *888# pour rester connecté.';
    const c = await runWith(t, learnt({ kind: 'telecom', action: 'pay', urgency: 'info' }), { kind: 'name', value: 'Camtel' });
    expect(c.scam.level).toBe('caution');
    expect(c.understanding.urgency).toBe('urgent');
  });
  it('(c) under caution the classifier cannot say "pay" where the rules found none', async () => {
    const t = 'Offre MTN: doublez votre recharge ce week-end ! https://mtn-promo.example/x';
    const c = await runWith(t, learnt({ kind: 'telecom', action: 'pay', urgency: 'urgent' }), { kind: 'name', value: 'MTN Cameroon' });
    expect(c.scam.level).toBe('caution');
    expect(c.understanding.action).not.toBe('pay');
    expect(keys(c)).not.toContain('action.pay');
  });
  it('(d) scam.check_balance follows the rules kind, not the classifier kind (sbt-030: UBA PIN scam, Pidgin)', async () => {
    const t = 'UBA: Abeg send yu PIN and password make we open yu account again, e don block.';
    const sender = { kind: 'number' as const, value: '+237699000192' };
    const rulesCard = await run(t, sender);
    const c = await runWith(t, learnt({ kind: 'bank', action: 'reply', urgency: 'info' }), sender);
    expect(rulesCard.understanding.kind).toBe('mobile_money');
    expect(keys(rulesCard)).toContain('scam.check_balance');
    expect(c.understanding.kind).toBe('bank');
    expect(keys(c)).toContain('scam.check_balance');
  });
  it('guardUnderstanding leaves a consistent answer alone, and is the identity for the rules themselves', () => {
    const r = rulesU();
    const f = facts('Payez 5 000 FCFA avant le 05/11/2026.');
    const ctx2 = { facts: f, receivedAt: '2026-10-31', amountNearPay: true };
    expect(guardUnderstanding(r, r, ctx2)).toBe(r);
    const same = rulesU({ kind: 'bank', urgency: 'urgent' });
    expect(guardUnderstanding(same, r, ctx2)).toBe(same);
    const weak = guardUnderstanding(rulesU({ action: 'nothing', urgency: 'info' }), r, ctx2);
    expect(weak.action).toBe('pay');
    expect(weak.urgency).toBe('soon');
  });
  it('buildCard without a rules baseline is unchanged', () => {
    const input = msg(PIDGIN);
    const card = buildCard({
      input, facts: facts(PIDGIN), understanding: rulesU({ action: 'nothing', urgency: 'info' }),
      scam: { level: 'no_signs', signals: [] }, sender: { verified: false }, lexicons, region,
    });
    expect(card.understanding.action).toBe('nothing');
  });
});

/* 5 */
describe('5. the amount goes with the chosen deadline', () => {
  it('two instalments: 30 000 with 15/01/2027', async () => {
    const c = await run('Lycée: 1ère tranche 45 000 FCFA avant le 15/10/2026, 2e tranche 30 000 FCFA avant le 15/01/2027.');
    expect(c.deadline?.value).toBe('2027-01-15');
    expect(c.amount?.value.amount).toBe(30000);
  });
  it('a total in its own sentence is still the amount', async () => {
    const c = await run('Montant: 15 000 FCFA. Veuillez régler avant le 15/11/2026.');
    expect(c.amount?.value.amount).toBe(15000);
  });
  it('a penalty in another clause does not steal the amount', async () => {
    const c = await run('Facture de 15 000 FCFA, dont 2 000 FCFA de pénalité, à payer avant le 15/11/2026.');
    expect(c.amount?.value.amount).toBe(15000);
  });
});

/* 6 */
describe('6. a balance is never the amount', () => {
  it('"Votre solde est de 2 350 FCFA" has no money.amount', async () => {
    const c = await run('MoMo: Votre solde est de 2 350 FCFA. Rechargez…');
    expect(c.amount).toBeUndefined();
    expect(keys(c)).not.toContain('money.amount');
  });
  it('the received amount is chosen over the new balance', async () => {
    const c = await run('Vous avez reçu 5 000 FCFA de Mary. Nouveau solde: 21 000 FCFA.');
    expect(c.amount?.value.amount).toBe(5000);
  });
  it('a balance that is due ("solde à payer") is still an amount', async () => {
    const c = await run('Solde à payer: 12 000 FCFA avant le 15/11/2026.');
    expect(c.amount?.value.amount).toBe(12000);
  });
});

/* 7 */
describe('7. receivedAt is validated', () => {
  const bad = ['not-a-date', '2026-13-45', '31/10/2026', '', '2026-02-30'];
  for (const r of bad)
    it(`'${r}': no relative or weekday date, no non-ISO value anywhere`, async () => {
      const t = 'Payez demain ou avant vendredi, avant le 15/11, puis le 15/11/2026.';
      const f = facts(t, r);
      for (const d of f.dates) expect(d.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.dates.map((d) => d.raw)).toEqual(['15/11/2026']);
      const c = await run(t, undefined, r);
      for (const d of c.facts.dates) expect(d.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.input.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  it('a valid receivedAt still resolves "demain"', () => {
    expect(facts('Payez demain.').dates.map((d) => d.value)).toEqual(['2026-11-01']);
  });
});

/* 8 */
describe('8. lexicon terms cannot trigger catastrophic backtracking', () => {
  it("'a{n}{n}{n}{n}{n}b' on 'a' + 20000 digits + 'c' is fast", () => {
    const text = 'a' + '1'.repeat(20000) + 'c';
    const t0 = performance.now();
    findTerms(text, ['a{n}{n}{n}{n}{n}b']);
    expect(performance.now() - t0).toBeLessThan(100);
  });
  it('a run of {n} is one digit run and still matches', () => {
    expect(termSource('a{n}{n}b')).toBe(termSource('a{n}b'));
    expect(findTerms('dans les 30 minutes', ['dans les {n}{n} minutes']).length).toBe(1);
  });
  it('a term over 200 characters never matches', () => {
    const long = 'a'.repeat(250);
    expect(findTerms(long, [long])).toEqual([]);
    expect(findTerms('x ' + long.slice(0, 10), ['a'.repeat(10)]).length).toBe(1);
  });
});

/* 9 */
describe('9. the one-letter currency "F" needs real money digits', () => {
  it('"RDV à 8h 30 F. Mballa" has no amount', () => {
    expect(amounts('RDV à 8h 30 F. Mballa')).toEqual([]);
  });
  it('"2026 F" has no amount', () => {
    expect(amounts('2026 F')).toEqual([]);
  });
  it('real amounts in F still read', () => {
    expect(amounts('Total 45 000 F')).toEqual([45000]);
    expect(amounts('Payez 500 F')).toEqual([500]);
    expect(amounts('Payez 5000 F')).toEqual([5000]);
    expect(amounts('Frais: F 15 000')).toEqual([15000]);
    expect(amounts('Payez 30 F')).toEqual([]);
  });
});

/* 10 */
describe('10. a 9-digit reference is not a phone', () => {
  it('"N° compteur: 677123456" is a reference', () => {
    const f = facts('N° compteur: 677123456');
    expect(f.phones).toEqual([]);
    expect(f.references.map((r) => r.value)).toEqual(['677123456']);
  });
  it('a phone elsewhere in the same text is still a phone', () => {
    const f = facts('N° contrat: 677123456. Appelez le 699 12 34 56.');
    expect(f.phones.map((p) => p.value)).toEqual(['+237699123456']);
    expect(f.references.map((r) => r.value)).toEqual(['677123456']);
  });
});

/* 12 */
describe('12. lexicon gaps', () => {
  const sender = { kind: 'number' as const, value: '+237677123456' };
  it('Pidgin prize: congrats / you don win + call a number is prize_fee', async () => {
    const c = await run('Congrats! You don win 500,000 FCFA for MTN promo. Call 650 11 22 33 now to collect.', sender);
    expect(c.scam.signals).toContain('prize_fee');
    expect(c.scam.level).toBe('likely_scam');
    expect(keys(c)).not.toContain('help.call');
  });
  it('prize words without an operator name', async () => {
    for (const t of ['Congrats, you win a phone. Call 677123456 to claim.', 'You don win! Call 650 11 22 33 now.', 'Promo spéciale: appelez le 677123456 pour votre cadeau.'])
      expect((await run(t, sender)).scam.signals, t).toContain('prize_fee');
  });
  it('family impersonation: "j\'ai changé de numéro" + urgency is caution at least', async () => {
    for (const t of [
      "Salut c'est maman, j'ai changé de numéro. Envoie-moi 20 000 FCFA vite, urgent.",
      "Hi it's your son, I changed my number. Please send me 20000 FCFA urgently.",
    ]) {
      const c = await run(t);
      expect(c.scam.level, t).not.toBe('no_signs');
    }
  });
  it('a plain new-number notice is not flagged', async () => {
    expect((await run("Bonjour, j'ai changé de numéro, voici le nouveau: 677123456. Bonne journée.")).scam.level).toBe('no_signs');
  });
  it('accident / hospital emergency + call a personal number from an unverified sender is caution', async () => {
    for (const t of ['Ton frère a eu un accident, appelle vite le 677 12 34 56.', 'Hospital emergency: your brother had an accident. Call 677 12 34 56 now.']) {
      const c = await run(t);
      expect(c.scam.level, t).not.toBe('no_signs');
      expect(keys(c)).not.toContain('help.call');
    }
  });
  it('a hospital appointment with the hospital number is not flagged', async () => {
    const c = await run('Hôpital Laquintinie: rendez-vous demain à 8h. Pour toute information appelez le 233 42 00 11.');
    expect(c.scam.level).toBe('no_signs');
  });
  it('2-digit years: 99 is not 2099; 26/27 near receivedAt are read', () => {
    expect(facts('avant le 15/11/99').dates).toEqual([]);
    expect(facts('avant le 15/11/26').dates.map((d) => d.value)).toEqual(['2026-11-15']);
    expect(facts('avant le 15/11/32').dates).toEqual([]);
    expect(facts('avant le 15-11-25').dates.map((d) => d.value)).toEqual(['2025-11-15']);
    expect(facts('avant le 15/11/20').dates).toEqual([]);
  });
});

/* 13 */
describe('13. operator promotions are "nothing to do", not urgent', () => {
  for (const t of [
    "MTN: Offre exceptionnelle! Doublez votre recharge aujourd'hui seulement. Rechargez 1.500 FCFA tout de suite.",
    "Doublez votre recharge aujourd'hui seulement. Bonus offert!",
    'Orange: Get a 100% recharge bonus! Reply YES to this message to activate it.',
  ])
    it(`nothing / info: ${t.slice(0, 40)}`, async () => {
      const c = await run(t, { kind: 'name', value: 'MTN Cameroon' });
      expect(c.understanding.kind).toBe('telecom');
      expect(c.understanding.action).toBe('nothing');
      expect(c.understanding.urgency).toBe('info');
      expect(c.scam.level).not.toBe('likely_scam');
    });
  it('a bill that mentions an offer is still a bill to pay', async () => {
    const c = await run('ENEO: Facture de 12 000 FCFA à payer avant le 05/11/2026. Profitez de nos offres promotionnelles.');
    expect(c.understanding.action).toBe('pay');
  });
});
