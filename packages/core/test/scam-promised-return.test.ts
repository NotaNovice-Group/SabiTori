import { describe, expect, it } from 'vitest';
import { analyze, assessScam, extractFacts } from '../src/index.js';
import type { MessageInput } from '../src/types.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const assess = (text: string, sender?: MessageInput['sender']) => assessScam(msg(text, sender), extractFacts(text, ctx), region, lexicons);
const mobile = { kind: 'number' as const, value: '+237680112233' };

describe('investment-doubling scams (probe 13)', () => {
  it('"invest X, receive much more" warns as likely scam', () => {
    for (const t of [
      "Investissez 50 000 FCFA aujourd'hui et recevez 200 000 FCFA dans 7 jours. Places limitées! WhatsApp 680 11 22 33",
      'Invest 25,000 FCFA now and earn 100,000 FCFA in one week. Join our group.',
      'Placez 10 000 FCFA, récupérez 30 000 FCFA en 48h.',
    ]) {
      const r = assess(t, mobile);
      expect(r.signals).toContain('promised_return');
      expect(r.level).toBe('likely_scam');
    }
  });
  it('"double your money" warns even from a sender name', () => {
    expect(assess('Doublez votre argent en 72 heures avec notre programme. Inscription gratuite.', { kind: 'name', value: 'INFO' }).level).toBe('likely_scam');
    expect(assess('Guaranteed profit every week! Contact us to start.', mobile).signals).toContain('promised_return');
  });
  it('the card warns first', async () => {
    const c = await analyze(msg("Investissez 50 000 FCFA aujourd'hui et recevez 200 000 FCFA dans 7 jours.", mobile), { region, lexicons });
    expect(c.scam.level).toBe('likely_scam');
    expect(c.scam.signals).toContain('promised_return');
  });
  it('ordinary money messages stay clean', () => {
    expect(assess('Cotisez 10 000 FCFA ce samedi; la bénéficiaire du mois recevra 120 000 FCFA.', mobile).signals).not.toContain('promised_return');
    expect(assess('MTN: Vous avez reçu 12 500 FCFA de PAUL NGONO. Nouveau solde: 30 200 FCFA.', { kind: 'name', value: 'MobileMoney' }).level).toBe('no_signs');
    expect(assess('Investissez dans votre avenir: ouvrez un compte épargne à la CCA Bank.', { kind: 'name', value: 'CCA' }).signals).not.toContain('promised_return');
    expect(assess('Frais de scolarité: 40 000 FCFA. Total annuel 100 000 FCFA à payer avant le 15/12/2026.', { kind: 'name', value: 'College' }).signals).not.toContain('promised_return');
  });
});
