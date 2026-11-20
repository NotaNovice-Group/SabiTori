import { describe, expect, it } from 'vitest';
import { assessScam, extractFacts } from '../src/index.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const N = { kind: 'number' as const, value: '+237699887766' };

describe('probe 18: genuine money talk in shorthand gets no warning', () => {
  it.each([
    "Papa j'ai envoyé 10 000 pour la ration ce matin, confirme stp",
    'Maman a dit envoie 5 000 à tonton pour le taxi, il t appelle',
    'I don send 20 000 for your account, check am',
    'Bro abeg remind me to send 15 000 to Mami for Christmas',
    'Le prof a dit d envoyer 2 000 pour les photocopies avant lundi',
    'Envoie moi la photo du reçu de 25 000 stp',
    'Tontine: chacun envoie 10 000 au trésorier Paul avant samedi',
    'Pls send me the 3 000 when u get paid, no stress',
  ])('%s', (t) => {
    expect(assessScam(msg(t, N), extractFacts(t, ctx), region, lexicons).level).toBe('no_signs');
  });
});
