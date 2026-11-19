import { describe, expect, it } from 'vitest';
import { assessScam, extractFacts } from '../src/index.js';
import type { MessageInput } from '../src/types.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const assess = (text: string, sender?: MessageInput['sender']) => assessScam(msg(text, sender), extractFacts(text, ctx), region, lexicons);
const mobile = { kind: 'number' as const, value: '+237677889900' };

describe('"send money to this number" from a mobile number (probe 13)', () => {
  it('warns: the number to pay is the sender\'s own, even when not written out', () => {
    for (const t of [
      'Hello, I am stranded at the border, my phone was stolen. Please send 20,000 FCFA to this number, I will refund tomorrow.',
      "Bonjour maman, c'est moi ton fils. Mon téléphone est gâté. Envoie-moi 15 000 FCFA sur ce numéro stp.",
    ]) {
      const r = assess(t, mobile);
      expect(r.signals).toContain('pay_to_personal_number');
      expect(r.level).toBe('likely_scam');
    }
  });
  it('needs money, a send word and "this number" in one sentence', () => {
    expect(assess('Mon nouveau numéro: enregistre ce numéro stp. On se voit samedi.', mobile).level).toBe('no_signs');
    expect(assess('Envoie-moi 15 000 FCFA demain. Appelle-moi sur ce numéro ce soir.', mobile).signals).not.toContain('pay_to_personal_number');
  });
  it('not from an official sender name', () => {
    expect(assess('Rechargez 1 000 FCFA sur ce numéro et recevez 500 Mo de bonus.', { kind: 'name', value: 'MTN' }).signals).not.toContain('pay_to_personal_number');
  });
});
