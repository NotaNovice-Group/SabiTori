import { describe, expect, it } from 'vitest';
import { assessScam, extractFacts } from '../src/index.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const N = { kind: 'number' as const, value: '+237690554433' };
const level = (t: string) => assessScam(msg(t, N), extractFacts(t, ctx), region, lexicons);

describe('probe 17: scams in SMS shorthand', () => {
  it('"sur ce num", "to this nbr", "snd ... dis numba" are money asked to a personal number', () => {
    for (const t of [
      'Maman stp envoi 15 000f sur ce num c urgent',
      'pls send 5000 frs to this nbr i dey hospital',
      'Bro abeg snd me 10 000 for dis numba 677 12 34 56 quick quick, i go pay u tmrw',
    ]) {
      const r = level(t);
      expect(r.signals, t).toContain('pay_to_personal_number');
      expect(r.level, t).toBe('likely_scam');
    }
  });
  it('ordinary shorthand messages stay clean', () => {
    for (const t of ['Slt, on se voit ce soir? Appelle moi stp', 'Bjr maman, g bien reçu les 10 000 merci bcp', "Rdv chez le dentiste demain 10h, n'oublie pas", 'Sorry I snd the photos late, see u tmrw'])
      expect(level(t).level, t).toBe('no_signs');
  });
});

describe('money asked without a currency', () => {
  const amounts = (t: string) => extractFacts(t, ctx).amounts.map((a) => a.value.amount);
  it('a grouped number right after a send word is an amount', () => {
    expect(amounts('snd me 10 000 for dis numba')).toEqual([10000]);
    expect(amounts('envoie-moi 15.000 stp')).toEqual([15000]);
    expect(amounts('Envoyez 25 000 au 677 12 34 56')).toEqual([25000]);
  });
  it('not a bare number, a year, a phone or a reference', () => {
    expect(amounts('envoie 2026 photos')).toEqual([]);
    expect(amounts('envoie 500 messages')).toEqual([]);
    expect(amounts('envoyez au 677 12 34 56')).toEqual([]);
    expect(amounts('on se voit à 10 000 mètres')).toEqual([]);
  });
});
