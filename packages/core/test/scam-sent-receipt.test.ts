import { describe, expect, it } from 'vitest';
import { assessScam, extractFacts } from '../src/index.js';
import type { MessageInput } from '../src/types.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const assess = (text: string, sender?: MessageInput['sender']) => {
  const input = msg(text, sender);
  return assessScam(input, extractFacts(text, ctx), region, lexicons);
};

describe('a "you sent money" receipt is not a call-this-number trap (photo benchmark pages 25-28)', () => {
  it('the number of the person paid is not a number to call', () => {
    expect(assess('Vous avez envoye 41 100 FCFA a SAMUEL FOTSO (677465100) le 19/10/2026.\nFrais: 800 FCFA. Nouveau solde: 20 007 FCFA.\nID de transaction: 5648139418.\nPour toute reclamation appelez le 8104.').level).toBe('no_signs');
    expect(assess('You have sent 900 FCFA to MARIE KAMGA (655634929) on 16/11/2026.\nFee: 100 FCFA. New balance: 9 771 FCFA.\nTransaction ID: 6218732262.\nFor any complaint call 8315.').level).toBe('no_signs');
  });
  it('a number to call after the receipt still counts', () => {
    const r = assess('MTN MoMo: Vous avez envoyé 5 000 FCFA. Erreur sur votre compte, appelez vite le 677 12 34 56 pour annuler.');
    expect(r.level).not.toBe('no_signs');
    expect(r.signals).toContain('asks_to_call_number');
  });
  it('"sent by mistake, send it back" scams still warn', () => {
    expect(assess('Vous avez envoyé par erreur 50 000 FCFA sur mon numéro. Renvoyez au 690 11 22 33 svp, appelez-moi.', { kind: 'number', value: '+237690112233' }).level).not.toBe('no_signs');
    expect(assess('MTN MoMo: you sent 25,000 FCFA. Your account will be blocked, call 677 55 44 33 now.').level).toBe('likely_scam');
  });
});
