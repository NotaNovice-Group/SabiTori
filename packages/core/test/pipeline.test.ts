import { describe, expect, it } from 'vitest';
import {
  analyze,
  assessScam,
  buildCard,
  buildSpeechPlan,
  CONFIDENCE_THRESHOLD,
  createRulesClassifier,
  extractFacts,
  matchSender,
  type Card,
  type Classifier,
} from '../src/index.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const run = (text: string, sender?: Parameters<typeof msg>[1], receivedAt = '2026-10-31') =>
  analyze(msg(text, sender, receivedAt), { region, lexicons });
const keys = (c: Card, today?: string) =>
  buildSpeechPlan(c, today ? { today } : {}).sections.flatMap((s) => s.utterances.map((u) => u.key));
const phoneSender = { kind: 'number' as const, value: '+237677123456' };

describe('full messages: French', () => {
  it('ENEO bill with due date and amount', async () => {
    const c = await run(
      'Votre facture ENEO N° 4561237 de 15 000 FCFA est disponible. Veuillez régler avant le 15/11/2026 pour éviter la coupure.',
    );
    expect(c.mode).toBe('full');
    expect(c.understanding.kind).toBe('electricity_bill');
    expect(c.understanding.action).toBe('pay');
    expect(c.amount?.value.amount).toBe(15000);
    expect(c.deadline?.value).toBe('2026-11-15');
    expect(c.reference?.value).toBe('4561237');
    expect(c.scam.level).toBe('no_signs');
    expect(keys(c)).toContain('deadline.by');
    expect(keys(c)).toContain('about.electricity_bill');
  });

  it('CAMWATER cut-off notice', async () => {
    const c = await run(
      'CAMWATER: Cher client, votre facture d\'eau de 8 400 FCFA est impayée. Une coupure interviendra le 5 novembre 2026 si le règlement n\'est pas effectué. Réf: CW-77812.',
    );
    expect(c.understanding.kind).toBe('water_bill');
    expect(c.understanding.action).toBe('pay');
    expect(c.understanding.urgency).toBe('urgent');
    expect(c.deadline?.value).toBe('2026-11-05');
    expect(c.amount?.value.amount).toBe(8400);
    expect(c.reference?.value).toBe('CW-77812');
  });

  it('genuine-looking MoMo receipt takes the received amount, not the balance', async () => {
    const c = await run(
      'Vous avez reçu 25 000 FCFA de Jean Mballa. Nouveau solde: 40 000 FCFA. ID de transaction: 8821993. Ne communiquez jamais votre code secret.',
      { kind: 'name', value: 'MTN MoMo' },
    );
    expect(c.understanding.kind).toBe('mobile_money');
    expect(c.understanding.action).toBe('nothing');
    expect(c.amount?.value.amount).toBe(25000);
    expect(c.scam.level).toBe('no_signs');
    expect(c.scam.signals).not.toContain('asks_pin');
    expect(c.scam.claimedSenderId).toBe('mtn-momo');
    expect(keys(c)).toContain('scam.no_signs');
    expect(keys(c)).toContain('sender.claimed');
  });

  it('MoMo wrong-transfer scam from an ordinary number', async () => {
    const c = await run(
      'Bonjour, je vous ai envoyé 50.000 F par erreur. Merci de me renvoyer au 699 12 34 56. Dieu vous bénisse.',
      phoneSender,
    );
    expect(c.scam.level).toBe('likely_scam');
    expect(c.scam.signals).toContain('wrong_transfer');
    expect(c.contactPhone).toBeUndefined();
    const k = keys(c);
    expect(k[0]).toBe('scam.likely');
    expect(k).toContain('scam.signal.wrong_transfer');
    expect(k).toContain('scam.check_balance');
    expect(k).not.toContain('action.pay');
    expect(k).not.toContain('money.amount');
    expect(k).toContain('help.none');
  });

  it('fake prize asking for a fee and PIN', async () => {
    const c = await run(
      'FELICITATIONS! Vous avez gagné 2 000 000 FCFA à la loterie MTN. Pour recevoir votre gain, envoyez 10 000 FCFA de frais et votre code PIN au 677 00 11 22 immédiatement.',
      phoneSender,
    );
    expect(c.scam.level).toBe('likely_scam');
    for (const s of ['prize_fee', 'asks_pin', 'time_pressure', 'sender_mismatch'] as const)
      expect(c.scam.signals).toContain(s);
    expect(c.contactPhone).toBeUndefined();
    expect(keys(c)[0]).toBe('scam.likely');
  });

  it('hospital appointment', async () => {
    const c = await run(
      "Hôpital Laquintinie: Rendez-vous de consultation le 4 novembre 2026 à 8h. Présentez-vous avec votre carnet et votre ordonnance. Pour toute question appelez le 233 42 00 11.",
    );
    expect(c.understanding.kind).toBe('health');
    expect(c.understanding.action).toBe('go_to_place');
    expect(c.deadline?.value).toBe('2026-11-04');
    expect(c.scam.level).toBe('no_signs');
    expect(c.contactPhone?.value).toBe('+237233420011');
    expect(keys(c)).toContain('help.call');
  });

  it('school fees', async () => {
    const c = await run(
      "Lycée de Bonamoussadi: les frais de scolarité de la 2e tranche, soit 45 000 FCFA, sont à régler avant le 20 novembre 2026. Merci.",
    );
    expect(c.understanding.kind).toBe('school');
    expect(c.understanding.action).toBe('pay');
    expect(c.amount?.value.amount).toBe(45000);
    expect(c.deadline?.value).toBe('2026-11-20');
  });

  it('administrative ID card pickup', async () => {
    const c = await run(
      "Commissariat central: votre carte nationale d'identité est prête. Vous pouvez la retirer au guichet de la préfecture du lundi au vendredi. Munissez-vous de votre récépissé N° 00457812.",
    );
    expect(c.understanding.kind).toBe('administrative');
    expect(c.understanding.action).toBe('collect');
    expect(c.reference?.value).toBe('00457812');
    expect(c.deadline).toBeUndefined();
  });

  it('threat to block a SIM', async () => {
    const c = await run(
      'URGENT: Votre carte SIM sera bloquée dans les 24 heures. Appelez le 655 44 33 22 pour confirmer votre identité.',
      phoneSender,
    );
    expect(c.scam.level).toBe('likely_scam');
    expect(c.scam.signals).toContain('account_block_threat');
    expect(c.scam.signals).toContain('asks_to_call_number');
    expect(c.contactPhone).toBeUndefined();
  });

  it('message with a bit.ly link is a caution at least', async () => {
    const c = await run('Votre colis est en attente. Suivez-le ici: bit.ly/3AbCdEf');
    expect(c.scam.signals).toContain('link');
    expect(c.scam.level).toBe('caution');
    expect(keys(c)).toContain('scam.signal.link');
    expect(keys(c)).toContain('scam.caution');
  });

  it('claims ENEO from an ordinary number: sender mismatch', async () => {
    const c = await run('ENEO: votre facture de 12 300 FCFA est impayée. Réglez avant le 2 novembre.', phoneSender);
    expect(c.scam.signals).toContain('sender_mismatch');
    expect(c.scam.level).toBe('likely_scam');
    const plan = buildSpeechPlan(c).sections.flatMap((s) => s.utterances);
    const u = plan.find((x) => x.key === 'scam.signal.sender_mismatch');
    expect(u?.slots?.sender).toEqual({ type: 'sender', officialId: 'eneo' });
  });

  it('fake balance notice from an ordinary number', async () => {
    const c = await run('Vous avez reçu 100 000 FCFA. Nouveau solde: 120 000 FCFA.', phoneSender);
    expect(c.scam.signals).toContain('fake_balance');
    expect(c.scam.level).toBe('likely_scam');
  });
});

describe('full messages: English', () => {
  it('ENEO bill', async () => {
    const c = await run(
      'Dear customer, your ENEO electricity bill of 18,500 FCFA is ready. Invoice no INV-445210. Please pay before 12th November 2026 to avoid disconnection.',
    );
    expect(c.facts.lang).toBe('en');
    expect(c.understanding.kind).toBe('electricity_bill');
    expect(c.understanding.action).toBe('pay');
    expect(c.amount?.value.amount).toBe(18500);
    expect(c.deadline?.value).toBe('2026-11-12');
    expect(c.reference?.value).toBe('INV-445210');
  });

  it('PIN scam in English', async () => {
    const c = await run(
      'Your MoMo account will be blocked. Send your secret PIN to 677123456 within 30 minutes to keep it active.',
      phoneSender,
    );
    expect(c.scam.level).toBe('likely_scam');
    expect(c.scam.signals).toEqual(expect.arrayContaining(['asks_pin', 'account_block_threat', 'time_pressure']));
  });

  it('English wrong-transfer scam', async () => {
    const c = await run('Hi, I sent you 20,000 FCFA by mistake. Please send it back to this number.', phoneSender);
    expect(c.scam.signals).toContain('wrong_transfer');
  });

  it('English receipt with warning about PIN is not asks_pin', async () => {
    const c = await run('You have received 5,000 FCFA from Paul. New balance: 9,000 FCFA. Never share your PIN with anyone.', {
      kind: 'name',
      value: 'MTN MoMo',
    });
    expect(c.scam.signals).not.toContain('asks_pin');
    expect(c.scam.level).toBe('no_signs');
    expect(c.amount?.value.amount).toBe(5000);
  });

  it('school fees in English', async () => {
    const c = await run('School fees of 60,000 FCFA are due before 30 November 2026. Kindly pay at the bursar office.');
    expect(c.understanding.kind).toBe('school');
    expect(c.deadline?.value).toBe('2026-11-30');
  });
});

describe('sender matching', () => {
  it('never verifies unverified entries', () => {
    expect(matchSender(msg('x', { kind: 'name', value: 'ENEO' }), region).sender.verified).toBe(false);
  });
  it('verifies only an official id on a verified sender', () => {
    const r = {
      ...region,
      officialSenders: region.officialSenders.map((o) =>
        o.id === 'eneo' ? { ...o, verified: true, smsSenderIds: ['ENEO-CM'], shortCodes: ['8010'] } : o,
      ),
    };
    const a = matchSender(msg('Facture', { kind: 'name', value: 'eneo-cm' }), r);
    expect(a.sender).toEqual({ officialId: 'eneo', displayName: 'ENEO', verified: true });
    expect(matchSender(msg('Facture', { kind: 'number', value: '8010' }), r).sender.verified).toBe(true);
    expect(matchSender(msg('ENEO facture', { kind: 'number', value: '+237677123456' }), r).sender.verified).toBe(false);
  });
  it('detects a claim from the text', () => {
    expect(matchSender(msg('Votre facture ENEO est prête'), region).claimedSenderId).toBe('eneo');
    expect(matchSender(msg('Message de camwater: coupure'), region).claimedSenderId).toBe('camwater');
  });
  it('prefers the longest alias', () => {
    expect(matchSender(msg('Orange Money: transfert'), region).claimedSenderId).toBe('orange-money');
  });
  it('does not treat a payment channel as the sender', () => {
    const t = 'Hôpital central: votre rendez-vous est confirmé pour demain. Vous pouvez payer les frais par Orange Money.';
    expect(matchSender(msg(t), region, lexicons).claimedSenderId).toBeUndefined();
  });
  it('returns no claim for an unrelated message', () => {
    expect(matchSender(msg('Bonjour, comment vas-tu ?'), region).claimedSenderId).toBeUndefined();
  });
});

describe('scam assessment', () => {
  const scam = (text: string, sender?: Parameters<typeof msg>[1]) => {
    const input = msg(text, sender);
    return assessScam(input, extractFacts(text, ctx), region, lexicons);
  };
  it('never returns a level meaning safe', () => {
    expect(['likely_scam', 'caution', 'no_signs']).toContain(scam('Bonjour').level);
  });
  it('a clean message has no signals', () => {
    expect(scam('Réunion des parents le 12 novembre 2026 à 15h.')).toEqual({ level: 'no_signs', signals: [] });
  });
  it('one weak signal is a caution', () => {
    expect(scam('Voir www.ecole.cm').level).toBe('caution');
  });
  it('two weak signals are likely_scam', () => {
    expect(scam('Voir www.ecole.cm. Réagissez immédiatement').level).toBe('likely_scam');
  });
  it('a warning sentence does not ask for a PIN', () => {
    expect(scam('Ne partagez jamais votre code PIN.').signals).toEqual([]);
    expect(scam('Envoyez votre code PIN pour confirmer.').signals).toEqual(['asks_pin']);
  });
  it('calling the claimed official helpline is fine', () => {
    const r = {
      ...region,
      officialSenders: region.officialSenders.map((o) => (o.id === 'eneo' ? { ...o, helpline: '233 42 00 11' } : o)),
    };
    const t = 'ENEO: pour toute question appelez le 233 42 00 11';
    expect(assessScam(msg(t), extractFacts(t, { ...ctx, region: r }), r, lexicons).signals).toEqual([]);
    expect(assessScam(msg(t), extractFacts(t, ctx), region, lexicons).signals).toEqual(['asks_to_call_number']);
  });
  it('works without lexicons (structural signals only)', () => {
    const t = 'ENEO facture http://x.cm/a';
    const input = msg(t, phoneSender);
    const s = assessScam(input, extractFacts(t, ctx), region);
    expect(s.signals).toEqual(expect.arrayContaining(['link', 'sender_mismatch']));
  });
});

describe('classifier', () => {
  it('has the contract id and accepts lexicons', async () => {
    const c = createRulesClassifier(region, lexicons);
    expect(c.id).toBe('rules@1');
    const t = 'Votre facture ENEO de 10 000 FCFA. Veuillez régler avant le 15/11/2026.';
    const u = await c.classify(msg(t), extractFacts(t, ctx));
    expect(u.kind).toBe('electricity_bill');
    expect(u.producedBy).toBe('rules@1');
    expect(u.confidence).toBeGreaterThan(0 );
    expect(u.confidence).toBeLessThanOrEqual(1);
  });
  it('gives low confidence for unknown text', async () => {
    const c = createRulesClassifier(region, lexicons);
    const t = 'Salut, on se voit plus tard au marché.';
    const u = await c.classify(msg(t), extractFacts(t, ctx));
    expect(u.kind).toBe('other');
    expect(u.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });
  it('marks a near deadline as urgent', async () => {
    const c = createRulesClassifier(region, lexicons);
    const t = 'Votre facture eau: payer 5 000 FCFA. Date: 1 novembre 2026';
    const u = await c.classify(msg(t), extractFacts(t, ctx));
    expect(u.urgency).toBe('urgent');
  });
  it('a dated task within 7 days is urgent (day 7 counts); day 8 and later is soon', async () => {
    const c = createRulesClassifier(region, lexicons);
    // received 2026-10-31
    for (const [date, want] of [['6 novembre 2026', 'urgent'], ['7 novembre 2026', 'urgent'], ['8 novembre 2026', 'soon'], ['20 novembre 2026', 'soon']] as const) {
      const t = `Votre facture eau: payer 5 000 FCFA avant le ${date}.`;
      expect((await c.classify(msg(t), extractFacts(t, ctx))).urgency, date).toBe(want);
    }
  });
  it('an information notice with a date stays info (planned cut, statement)', async () => {
    const c = createRulesClassifier(region, lexicons);
    for (const t of [
      "ENEO: Coupure d'électricité programmée le 02-11-2026 de 8h à 16h au quartier Akwa pour travaux. Veuillez nous excuser pour la gêne.",
      'CAMWATER: There will be no water supply on 03/11/2026 in Bastos because of repairs. Thank you for your understanding.',
    ]) {
      const u = await c.classify(msg(t), extractFacts(t, ctx));
      expect(u.action, t).toBe('nothing');
      expect(u.urgency, t).toBe('info');
    }
  });
});

describe('card builder', () => {
  it('uses a custom classifier and falls back to rules if it throws', async () => {
    const bad: Classifier = { id: 'x', classify: async () => { throw new Error('boom'); } };
    const c = await analyze(msg('Votre facture ENEO de 10 000 FCFA. Veuillez régler.'), { region, lexicons, classifier: bad });
    expect(c.understanding.producedBy).toBe('rules@1');
    const good: Classifier = {
      id: 'llm@1',
      classify: async () => ({ kind: 'bank', action: 'call', urgency: 'soon', confidence: 0.9, producedBy: 'llm@1' }),
    };
    const d = await analyze(msg('Votre facture ENEO de 10 000 FCFA.'), { region, lexicons, classifier: good });
    expect(d.understanding.producedBy).toBe('llm@1');
    expect(d.mode).toBe('full');
  });
  it('falls back to facts_only for low confidence', async () => {
    const c = await run('Salut, rendez-vous demain au marché pour 5 000 FCFA.');
    expect(c.mode).toBe('facts_only');
    expect(c.degradedReason).toBe('low_confidence');
    expect(keys(c)).toContain('facts_only.intro');
    expect(keys(c)).not.toContain('about.other');
  });
  it('falls back to facts_only for unreadable text', async () => {
    for (const t of ['ok', '#$%^&*()_+!@#$%^&', '��� abc ����']) {
      const c = await run(t);
      expect(c.mode).toBe('facts_only');
      expect(c.degradedReason).toBe('unreadable');
    }
  });
  it('fails verification when a fact does not match its span', () => {
    const input = msg('Votre facture ENEO de 10 000 FCFA. Veuillez régler.');
    const facts = extractFacts(input.text, ctx);
    const bad = { ...facts, amounts: facts.amounts.map((a) => ({ ...a, raw: '99 999 FCFA' })) };
    const c = buildCard({
      input,
      facts: bad,
      understanding: { kind: 'electricity_bill', action: 'pay', urgency: 'soon', confidence: 0.9, producedBy: 't' },
      scam: { level: 'no_signs', signals: [] },
      sender: { verified: false },
    });
    expect(c.mode).toBe('facts_only');
    expect(c.degradedReason).toBe('verification_failed');
    expect(c.amount).toBeUndefined();
  });
  it('picks the amount next to amount words over a bigger unrelated one', async () => {
    const c = await run('Facture ENEO. Montant à payer: 12 000 FCFA. Pénalité en cas de retard: 150 000 FCFA.');
    expect(c.amount?.value.amount).toBe(12000);
  });
  it('without any label picks the largest amount', async () => {
    const c = await run('Facture ENEO: 2 000 FCFA et 9 500 FCFA. Veuillez payer.');
    expect(c.amount?.value.amount).toBe(9500);
  });
  it('picks the deadline near deadline words, not the earliest date', async () => {
    const c = await run('Facture ENEO émise le 2 novembre 2026. Veuillez payer avant le 20 novembre 2026.');
    expect(c.deadline?.value).toBe('2026-11-20');
  });
  it('uses the earliest future date when no deadline word is present', async () => {
    const c = await run('Hôpital: consultation le 9 novembre 2026, contrôle le 3 novembre 2026. Rendez-vous au guichet.');
    expect(c.deadline?.value).toBe('2026-11-03');
  });
  it('keeps a past deadline so the plan can say it passed', async () => {
    const c = await run('Facture ENEO 10 000 FCFA à payer avant le 20/10/2026. Veuillez régler.');
    expect(c.deadline?.value).toBe('2026-10-20');
    expect(keys(c)).toContain('deadline.passed');
  });
  it('never surfaces a phone on a caution card', async () => {
    const c = await run('Votre colis: voir bit.ly/abc123 ou appelez le 677 12 34 56');
    expect(c.scam.level).not.toBe('no_signs');
    expect(c.contactPhone).toBeUndefined();
  });
  it('every chosen fact exists in facts with a matching span', async () => {
    const c = await run('Votre facture ENEO N° 4561237 de 15 000 FCFA. Veuillez régler avant le 15/11/2026.');
    for (const [f, pool] of [
      [c.deadline, c.facts.dates],
      [c.amount, c.facts.amounts],
      [c.reference, c.facts.references],
    ] as const) {
      expect(f).toBeDefined();
      expect(c.input.text.slice(f!.span.start, f!.span.end)).toBe(f!.raw);
      expect(pool.some((p) => p.span.start === f!.span.start && p.raw === f!.raw)).toBe(true);
    }
  });
});

describe('speech plan', () => {
  it('orders sections as CARD_SECTIONS and uses SlotValue shapes', async () => {
    const c = await run(
      'Votre facture ENEO de 15 000 FCFA. Veuillez régler avant le 15/11/2026. Merci.',
    );
    const plan = buildSpeechPlan(c, { today: '2026-10-31' });
    expect(plan.sections.map((s) => s.section)).toEqual(
      ['scam', 'sender', 'about', 'action', 'deadline', 'money', 'help', 'urgency'].filter((s) =>
        plan.sections.some((x) => x.section === s),
      ),
    );
    const flat = plan.sections.flatMap((s) => s.utterances);
    expect(flat.find((u) => u.key === 'deadline.by')?.slots?.date).toEqual({
      type: 'date',
      value: '2026-11-15',
      relativeTo: '2026-10-31',
    });
    expect(flat.find((u) => u.key === 'money.amount')?.slots?.amount).toEqual({
      type: 'money',
      value: { amount: 15000, currency: 'XAF' },
    });
    expect(flat.find((u) => u.key === 'sender.claimed')?.slots?.sender).toEqual({ type: 'sender', officialId: 'eneo' });
  });
  it('uses today for deadline.passed', async () => {
    const c = await run('Facture ENEO 10 000 FCFA. Veuillez régler avant le 15/11/2026.');
    expect(keys(c, '2026-11-20')).toContain('deadline.passed');
    expect(keys(c, '2026-11-01')).toContain('deadline.by');
  });
  it('omits deadline and money sections when absent', async () => {
    const c = await run('Votre carte nationale d\'identité est prête. Vous pouvez la retirer à la préfecture.');
    const k = keys(c);
    expect(k.some((x) => x.startsWith('deadline.'))).toBe(false);
    expect(k).not.toContain('money.amount');
    expect(k).toContain('help.none');
  });
  it('only emits catalog keys', async () => {
    const { PHRASE_KEYS } = await import('../src/index.js');
    const c = await run('FELICITATIONS! Vous avez gagné 2 000 000 FCFA. Envoyez votre code PIN et 10 000 FCFA de frais.', phoneSender);
    for (const k of keys(c)) expect(PHRASE_KEYS).toContain(k);
  });
  it('says no_signs for money kinds but never "safe"', async () => {
    const c = await run('Votre facture ENEO de 15 000 FCFA. Veuillez régler.');
    expect(keys(c)).toContain('scam.no_signs');
    expect(keys(c).join(' ')).not.toMatch(/safe/);
  });
  it('facts_only keeps scam warnings first', async () => {
    const c = await run('donne code secret vite 699123456', phoneSender);
    expect(c.mode).toBe('facts_only');
    expect(keys(c)[0]).toBe('scam.likely');
    expect(keys(c)).toContain('facts_only.intro');
  });
  it('a "send it back" scam read as pay still warns first and never says to pay', async () => {
    for (const t of ['ok 50.000 F par erreur renvoyer 699123456', 'I sent you 28.000 F CFA by mistake. Please send it back to 6 77 00 86 73.']) {
      const c = await run(t, phoneSender);
      expect(c.scam.level).toBe('likely_scam');
      const k = keys(c);
      expect(k[0]).toBe('scam.likely');
      expect(k.some((x) => x.startsWith('money.') || x.startsWith('action.pay') || x.startsWith('deadline.'))).toBe(false);
    }
  });
});

describe('span property checks', () => {
  const samples = [
    'Votre facture ENEO N° 4561237 de 15 000 FCFA. Veuillez régler avant le 15/11/2026. Appelez le 677 12 34 56 ou www.eneo.cm *126#',
    'Pay 15.000 F CFA by 12th Nov. Ref: AB-1234. Call +237 677 123 456, text 8080. bit.ly/xyz123',
    'Rendez-vous demain à 9h. Montant: 2 500 (FCFA). Avant le 3 déc. 2026 ou le 05-12-26. Tel 00237677123456',
    'XAF 15000, 15000F, 15 000 frs, November 12, 2026, 12.11.2026, #150*1#, N° facture: FAC/26/001',
    "Aujourd'hui même! Dial 8010. Transaction ID 55412099. Total: 1 250 000 FCFA",
  ];
  it('raw always equals the text slice, for every fact', () => {
    for (const t of samples) {
      const facts = extractFacts(t, ctx);
      const all = [
        ...facts.dates,
        ...facts.amounts,
        ...facts.phones,
        ...facts.references,
        ...facts.urls,
        ...facts.ussdCodes,
      ];
      expect(all.length).toBeGreaterThan(2);
      for (const f of all) {
        expect(f.span.start).toBeGreaterThanOrEqual(0);
        expect(f.span.end).toBeLessThanOrEqual(t.length);
        expect(f.span.start).toBeLessThan(f.span.end);
        expect(f.raw).toBe(t.slice(f.span.start, f.span.end));
      }
    }
  });
  it('facts of different kinds never overlap', () => {
    for (const t of samples) {
      const facts = extractFacts(t, ctx);
      const spans = [...facts.dates, ...facts.amounts, ...facts.phones, ...facts.references, ...facts.urls, ...facts.ussdCodes]
        .map((f) => f.span)
        .sort((a, b) => a.start - b.start);
      for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
    }
  });
  it('spans stay valid when text has accents and upper case', () => {
    const t = 'ÉCHÉANCE LE 12 NOVEMBRE 2026 — RÉGLEZ 15 000 FCFA';
    const facts = extractFacts(t, ctx);
    expect(facts.dates[0]?.raw).toBe('12 NOVEMBRE 2026');
    expect(facts.amounts[0]?.raw).toBe('15 000 FCFA');
  });
  it('is deterministic and does not throw on odd input', () => {
    for (const t of ['', ' ', '\n\n', '💥💥💥', 'a'.repeat(5000), '0'.repeat(300), '***###', '+++ 237']) {
      expect(() => extractFacts(t, ctx)).not.toThrow();
      expect(extractFacts(t, ctx)).toEqual(extractFacts(t, ctx));
    }
  });
});

describe('appointment dates', () => {
  it('a place to go is ON the date; a bill is BY it', async () => {
    const appt = await run('Hôpital Régional: Votre rendez-vous de consultation est fixé au 20/11/2026 à 9h00. Présentez-vous à l’accueil.');
    expect(appt.understanding.action).toBe('go_to_place');
    expect(appt.deadlineTime?.value).toBe('09:00');
    expect(keys(appt, '2026-10-31')).toContain('deadline.on_at_hour');
    expect(keys(appt, '2026-10-31')).not.toContain('deadline.by');
    const noTime = await run('Hôpital Régional: Votre rendez-vous de consultation est fixé au 20/11/2026. Présentez-vous à l’accueil.');
    expect(keys(noTime, '2026-10-31')).toContain('deadline.on');
    const half = await run('Tribunal de Kumba: vous êtes convoqué à l’audience du 13/11/2026 à 09h30, salle 4. Présentez-vous à l’accueil.');
    expect(half.deadlineTime?.value).toBe('09:30');
    if (half.understanding.action === 'go_to_place') {
      const plan = buildSpeechPlan(half, { today: '2026-10-31' }).sections.flatMap((x) => x.utterances);
      const u = plan.find((x) => x.key === 'deadline.on_at')!;
      expect(u.slots).toMatchObject({ hour: { type: 'number', value: 9 }, minutes: { type: 'number', value: 30 } });
    }
    const bill = await run('ENEO: facture de 15 000 FCFA à payer avant le 15/11/2026.');
    expect(keys(bill, '2026-10-31')).toContain('deadline.by');
    expect(keys(bill, '2026-10-31')).not.toContain('deadline.on');
  });
});

describe('time right after the deadline date', () => {
  it('reads h and colon times close after the date, 24-hour clock', async () => {
    const { timeAfter } = await import('../src/card.js');
    const at = (t: string) => timeAfter(t, t.indexOf('#') + 1)?.value;
    expect(at('le 20/11/2026# à 9h00.')).toBe('09:00');
    expect(at('le 20/11/2026# à 14h30')).toBe('14:30');
    expect(at('on 20 November 2026# at 9:30.')).toBe('09:30');
    expect(at('le 20/11/2026#, 08h')).toBe('08:00');
    expect(at('le 20/11/2026# a 7 h 15')).toBe('07:15');
  });
  it('never takes a number that is not a time, or a time far from the date', async () => {
    const { timeAfter } = await import('../src/card.js');
    const at = (t: string) => timeAfter(t, t.indexOf('#') + 1);
    for (const t of ['le 20/11/2026#. Montant 15 000 FCFA', 'le 20/11/2026# au 677 12 34 56', 'le 20/11/2026# à 25h00', 'le 20/11/2026#. Merci de venir avec votre carnet, à 9h00', 'le 20/11/2026# à 9h75'])
      expect(at(t)).toBeUndefined();
    const f = at('le 20/11/2026# à 9h00.')!;
    expect('le 20/11/2026# à 9h00.'.slice(f.span.start, f.span.end)).toBe(f.raw);
    expect(f.raw).toBe('9h00');
  });
});

describe('sender line', () => {
  const senderUtt = async (sender: Parameters<typeof msg>[1]) => {
    const c = await run('Votre rendez-vous de consultation est fixé au 20/11/2026 à 9h00. Présentez-vous à l’accueil.', sender);
    return buildSpeechPlan(c, { today: '2026-10-31' }).sections.find((x) => x.section === 'sender')?.utterances[0];
  };
  it('a name the phone showed is said as a claim, never as "is from"', async () => {
    const u = await senderUtt({ kind: 'name', value: '  Hôpital   Régional ' });
    expect(u?.key).toBe('sender.claimed');
    expect(u?.slots?.sender).toEqual({ type: 'sender', fallbackText: 'Hôpital Régional' });
  });
  it('a number, a number-like name, or no sender stays unknown; a long name is capped', async () => {
    expect((await senderUtt({ kind: 'number', value: '+237677123456' }))?.key).toBe('sender.unknown');
    expect((await senderUtt({ kind: 'name', value: '+237 677 12 34 56' }))?.key).toBe('sender.unknown');
    expect((await senderUtt(undefined))?.key).toBe('sender.unknown');
    const long = await senderUtt({ kind: 'name', value: 'A'.repeat(80) });
    expect((long?.slots?.sender as { fallbackText: string }).fallbackText).toHaveLength(40);
  });
});

describe('12-hour times and notices', () => {
  it('reads am/pm times after the date', async () => {
    const { timeAfter } = await import('../src/card.js');
    const at = (t: string) => timeAfter(t, t.indexOf('#') + 1)?.value;
    expect(at('tomorrow# at 3pm.')).toBe('15:00');
    expect(at('on 20 November 2026# at 10:30 am')).toBe('10:30');
    expect(at('on 20/11/2026# at 12 p.m.')).toBe('12:00');
    expect(at('on 20/11/2026# at 12am')).toBe('00:00');
    expect(at('on 20/11/2026# at 8 a.m.')).toBe('08:00');
    expect(at('on 20/11/2026#, 13pm')).toBeUndefined();
  });
  it('a notice that asks for nothing gives its date, not a deadline', async () => {
    const c = await run('CAMWATER: Water supply will be interrupted on 26/11/2026 from 8am to 4pm in Molyko. Sorry for the inconvenience.', { kind: 'name', value: 'CAMWATER' });
    if (c.mode === 'full' && c.understanding.action === 'nothing') {
      const k = keys(c, '2026-11-18');
      expect(k).toContain('deadline.date');
      expect(k).not.toContain('deadline.by');
    } else throw new Error(`expected a full card with nothing to do, got ${c.mode} ${c.understanding.action}`);
  });
});

describe('start dates', () => {
  it('"from Monday 23rd" or "à partir du" is when something starts, not a deadline', async () => {
    const { startsOn } = await import('../src/card.js');
    const at = (t: string) => startsOn(t, t.indexOf('#'));
    for (const t of ['Collect your slip from Monday #23rd November', 'Retrait à partir du #23/11/2026', 'Inscriptions dès le #5 décembre', 'Open starting on #1 December'])
      expect(at(t), t).toBe(true);
    for (const t of ['Pay before #30/11/2026', 'Payez avant le #30/11/2026', 'Rendez-vous le #20/11/2026', 'From the bursary: pay by #30/11/2026'])
      expect(at(t), t).toBe(false);
    const c = await run('GHS Bamenda: Your exam results are out. Collect your slip at the school office from Monday 23rd November 2026.', { kind: 'name', value: 'GHS Bamenda' });
    expect(c.deadlineFrom).toBe(true);
    const k = keys(c, '2026-11-18');
    expect(k).toContain('deadline.from');
    expect(k).not.toContain('deadline.by');
  });
});

describe('appointment times as people say them', () => {
  const at = async (time: string) => {
    const c = await run(`Hôpital Régional: Votre rendez-vous de consultation est fixé au 20/11/2026 à ${time}. Présentez-vous à l’accueil.`);
    return buildSpeechPlan(c, { today: '2026-10-31' }).sections.flatMap((x) => x.utterances).find((u) => u.key.startsWith('deadline.on_at'))!;
  };
  it('morning keeps the hour; afternoon and evening use the 12-hour clock with the part of the day', async () => {
    expect(await at('9h00')).toMatchObject({ key: 'deadline.on_at_hour', slots: { hour: { value: 9 } } });
    expect(await at('10h30')).toMatchObject({ key: 'deadline.on_at', slots: { hour: { value: 10 }, minutes: { value: 30 } } });
    expect(await at('15h00')).toMatchObject({ key: 'deadline.on_at_hour_pm', slots: { hour: { value: 3 } } });
    expect(await at('12h00')).toMatchObject({ key: 'deadline.on_at_hour_pm', slots: { hour: { value: 12 } } });
    expect(await at('19h30')).toMatchObject({ key: 'deadline.on_at_eve', slots: { hour: { value: 7 }, minutes: { value: 30 } } });
  });
});
