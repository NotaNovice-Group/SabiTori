import { describe, expect, it } from 'vitest';
import { assessScam, extractFacts } from '../src/index.js';
import type { MessageInput } from '../src/types.js';
import { ctx, lexicons, msg, region } from './helpers.js';

/**
 * Common mobile-money and utility scam patterns in Cameroon, each with a "twin": the real message it imitates.
 * A scam must get a warning (caution or likely_scam); its twin must not, so false alarms are measured as
 * strictly as missed scams. Senders: a scam usually comes from an ordinary mobile number, the real message
 * from the operator's name.
 */
const fromNumber = (n: string): MessageInput['sender'] => ({ kind: 'number', value: n });
const fromName = (n: string): MessageInput['sender'] => ({ kind: 'name', value: n });

interface Pair {
  name: string;
  scam: { text: string; sender?: MessageInput['sender'] };
  twin: { text: string; sender?: MessageInput['sender'] };
}

const PAIRS: Pair[] = [
  {
    name: 'fr: fake transfer, "send it back"',
    scam: { text: 'Vous avez reçu 50 000 FCFA de NGONO Paul. Nouveau solde: 50 250 FCFA. Ce transfert a été fait par erreur, merci de renvoyer au 677 12 34 56.', sender: fromNumber('677123456') },
    twin: { text: 'Vous avez reçu 50 000 FCFA de NGONO Paul. Nouveau solde: 50 250 FCFA. Merci d’utiliser MTN Mobile Money.', sender: fromName('MTN MoMo') },
  },
  {
    name: 'en: fake transfer, "send it back"',
    scam: { text: 'You have received 25,000 FCFA from Mary. New balance 25,300 FCFA. I sent it by mistake, please return it to 699 11 22 33.', sender: fromNumber('699112233') },
    twin: { text: 'You have received 25,000 FCFA from Mary. New balance 25,300 FCFA. Thank you for using Orange Money.', sender: fromName('Orange Money') },
  },
  {
    name: 'fr: prize that needs a fee',
    scam: { text: 'Félicitations! Vous avez gagné 500 000 FCFA à la tombola MTN. Envoyez 5 000 FCFA de frais de dossier au 655 44 33 22 pour recevoir votre lot.', sender: fromNumber('655443322') },
    twin: { text: 'MTN: votre bonus de 500 Mo a été crédité sur votre compte. Il est valable 7 jours.', sender: fromName('MTN') },
  },
  {
    name: 'en: prize that needs a fee',
    scam: { text: 'Congratulations! You have won 1,000,000 FCFA in the Orange promo. Send 10,000 FCFA processing fee to 690 55 66 77 to claim your prize.', sender: fromNumber('690556677') },
    twin: { text: 'Orange: your 1 GB data bonus has been added. Valid 7 days.', sender: fromName('Orange') },
  },
  {
    name: 'fr: account-block threat asking for the secret code',
    scam: { text: 'Votre compte Orange Money sera bloqué dans 24h. Pour éviter le blocage, envoyez votre code secret au 677 98 76 54.', sender: fromNumber('677987654') },
    twin: { text: 'Orange Money: pour votre sécurité, ne communiquez jamais votre code secret, même à un agent Orange.', sender: fromName('Orange Money') },
  },
  {
    name: 'en: fake agent asking for the confirmation code',
    scam: { text: 'Hello, I am an MTN MoMo agent. Please tell me the confirmation code you will receive now so I can fix your account.', sender: fromNumber('650001122') },
    twin: { text: 'Your MTN MoMo confirmation code is 482913. Never share this code with anyone, not even MTN staff.', sender: fromName('MTN MoMo') },
  },
  {
    name: 'fr: fake agent asking for the confirmation code',
    scam: { text: 'Bonjour, ici le service client Orange Money. Dictez-moi le code de confirmation que vous allez recevoir pour annuler la transaction.', sender: fromNumber('691234567') },
    twin: { text: 'Votre code de confirmation Orange Money est 482913. Ne le communiquez à personne.', sender: fromName('Orange Money') },
  },
  {
    name: 'fr: fake power-cut payment to a personal number',
    scam: { text: 'ENEO: votre courant sera coupé aujourd’hui. Payez immédiatement 15 000 FCFA par Mobile Money au 699 87 65 43 pour éviter la coupure.', sender: fromNumber('699876543') },
    twin: { text: 'ENEO: votre facture de 15 000 FCFA est disponible. Date limite de paiement: 30 novembre 2026. Payez dans nos agences ou via l’application ENEO.', sender: fromName('ENEO') },
  },
  {
    name: 'fr: job offer with a registration fee',
    scam: { text: 'Offre d’emploi: gagnez 200 000 FCFA par semaine depuis chez vous. Envoyez 5 000 FCFA de frais d’inscription au 677 22 11 00.', sender: fromNumber('677221100') },
    twin: { text: 'Mairie de Douala: le recrutement des agents municipaux est ouvert. Dépôt des dossiers à la mairie avant le 30 novembre 2026. Aucun frais n’est demandé.', sender: fromName('Mairie de Douala') },
  },
  {
    name: 'fr: bank short name from a personal number (bank not in the region list)',
    scam: { text: 'SGC: Opération suspecte de 260 000 FCFA détectée sur votre compte. Appelez votre conseiller au 699 12 34 56.', sender: fromNumber('699123456') },
    twin: { text: 'SGC: Votre virement de 260 000 FCFA a été exécuté le 12/11/2026.', sender: fromName('SGC') },
  },
  {
    name: 'en: account closure threat vs a school closed for a holiday',
    scam: { text: 'Your account will be closed today. Call 677 98 76 54 to keep it open.', sender: fromNumber('677987654') },
    twin: { text: 'Government Primary School: the school will be closed on 07/11/2026 for a public holiday. Classes resume the next day.', sender: fromName('Government Primary School') },
  },
  {
    name: 'fr: congratulations that ask for a fee vs real school results',
    scam: { text: 'Félicitations, envoyez 5 000 FCFA de frais au 655 44 33 22 pour recevoir votre bourse.', sender: fromNumber('655443322') },
    twin: { text: "Lycée Bilingue: Résultats du 1er trimestre: l'élève Blaise est admis en classe supérieure. Félicitations. Paiement de la scolarité bien reçu.", sender: fromName('Lycée Bilingue') },
  },
  {
    name: 'fr: utility switchboard (fixed line) vs the same text from a mobile number',
    scam: { text: 'CAMWATER: Fuite détectée sur votre branchement. Appelez le 233 00 15 85 immédiatement.', sender: fromNumber('690112233') },
    twin: { text: "CAMWATER: Fuite détectée sur votre branchement. Pour plus d'informations appelez le service client au 233 00 15 85.", sender: fromName('CAMWATER') },
  },
];

const level = (text: string, sender?: MessageInput['sender']) =>
  assessScam(msg(text, sender), extractFacts(text, ctx), region, lexicons);

describe('scam patterns and their real twins', () => {
  for (const p of PAIRS) {
    it(`${p.name}: the scam gets a warning`, () => {
      const r = level(p.scam.text, p.scam.sender);
      expect(r.level, JSON.stringify(r)).not.toBe('no_signs');
    });
    it(`${p.name}: the real message gets none`, () => {
      const r = level(p.twin.text, p.twin.sender);
      expect(r.level, JSON.stringify(r)).toBe('no_signs');
    });
  }
});
