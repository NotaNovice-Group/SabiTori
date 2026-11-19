import { describe, expect, it } from 'vitest';
import { assessScam, extractFacts } from '../src/index.js';
import type { MessageInput } from '../src/types.js';
import { ctx, lexicons, msg, region } from './helpers.js';

// Probe 14 (2026-11-19): messages written for this probe, not eval data. Mobile senders are 'number', official
// names are 'name'. Every scam must warn (any level but no_signs); every genuine look-alike must be no_signs.
type S = MessageInput['sender'];
const num = (v = '+237677889900'): S => ({ kind: 'number', value: v });
const name = (v: string): S => ({ kind: 'name', value: v });
const assess = (t: string, s: S) => assessScam(msg(t, s), extractFacts(t, ctx), region, lexicons);

const SCAMS: [string, S][] = [
  // job / recruitment fees
  ["Félicitations, vous êtes retenu au concours de l'ENAM 2026. Pour finaliser votre dossier, versez 25 000 FCFA au 677 45 12 89 avant vendredi.", num()],
  ['MINFOPRA: Votre recrutement dans la fonction publique est validé. Frais de prise en charge 35 000 FCFA à envoyer par OM au 699 12 34 56.', num('+237699123456')],
  ['Recrutement spécial armée camerounaise 2026: 500 places. Contactez le Colonel au 655 44 33 22, prévoir 150 000 FCFA pour garantir votre place.', num('+237655443322')],
  ['Hello, you have been selected for a job at Total Energies Douala. Salary 450,000 FCFA. Send 15,000 FCFA processing fee to 670 11 22 33 to book your interview.', num('+237670112233')],
  // scholarship / visa
  ['Your application for the Canada study scholarship has been approved. Pay visa processing fee of 75,000 FCFA via MoMo to 651 23 45 67 within 48 hours.', num('+237651234567')],
  ['Bourse Campus France 2026 accordée. Pour le traitement de votre visa, payez 60 000 FCFA au 694 55 66 77.', num('+237694556677')],
  // SIM swap
  ['MTN: Votre carte SIM sera bloquée dans 24h pour défaut d\'identification. Envoyez une photo de votre CNI et votre code PIN au 650 98 76 54.', num('+237650987654')],
  ['Dear customer, your SIM will be deactivated today. Reply with your ID card number and the code you will receive to keep your line.', num('+237680001122')],
  // fake police / gendarmerie fine
  ["Gendarmerie nationale: vous avez une amende de 50 000 FCFA pour excès de vitesse. Payez au 677 00 11 22 aujourd'hui sinon vous serez convoqué.", num('+237677001122')],
  ['This is the police commissariat central. Your son has been arrested. Send 100,000 FCFA bail to 690 33 44 55 now and he will be released.', num('+237690334455')],
  // customs parcel
  ["Votre colis est bloqué à la douane de Douala. Payez les frais de dédouanement 45 000 FCFA au 699 88 77 66 pour la livraison.", num('+237699887766')],
  ['DHL: your parcel from London is held at customs. Pay clearance charges of 38,500 FCFA to agent on 672 44 55 66 to release it.', num('+237672445566')],
  // government aid
  ["Fonds de solidarité COVID: le gouvernement vous accorde 150 000 FCFA. Envoyez 5 000 FCFA de frais d'enregistrement au 653 21 21 21.", num('+237653212121')],
  // fake bank verification
  ['Afriland First Bank: votre compte sera suspendu. Mettez à jour vos informations sur http://afriland-verif.com', num('+237677334455')],
  ['UBA: Dear customer, we noticed unusual activity. Kindly confirm your card PIN and account number by reply to avoid suspension.', num('+237698112233')],
  ['SCB Cameroun: Pour la vérification de votre compte, communiquez votre mot de passe et le code reçu par SMS.', num('+237677556677')],
  // loan apps
  ['Prêt rapide sans garantie: obtenez 500 000 FCFA en 10 minutes. Payez seulement 10 000 FCFA de frais de dossier au 670 77 88 99.', num('+237670778899')],
  ['Easy loan approved! 300,000 FCFA ready for you. Send 8,000 FCFA insurance fee to 681 22 33 44 to receive the money today.', num('+237681223344')],
  // crypto/forex doubling
  ['Join our forex trading group. Invest 100,000 FCFA and receive 500,000 FCFA in one week. Bitcoin guaranteed. WhatsApp 676 99 00 11.', num('+237676990011')],
  // fake operator promo
  ['Orange: Félicitations! Vous avez gagné un bonus de 50 000 FCFA. Composez *150*1*655443322# pour le recevoir.', num('+237655443300')],
  ['MTN Promo: You don win 25,000 FCFA airtime bonus. Dial *126*4*677112233# to activate before midnight.', num('+237677112200')],
  // Hajj / lottery
  ["Vous êtes l'heureux gagnant d'un voyage à La Mecque pour le Hadj 2027. Frais de réservation 20 000 FCFA à envoyer au 696 12 12 12.", num('+237696121212')],
  // romance / abroad
  ['My love, I am stuck at the airport in Paris, they seized my luggage. Please send me 200,000 FCFA through Western Union today, I will pay you back when I land.', num('+237699554433')],
  // fake school fees to personal number
  ['Chers parents, les frais de la 2e tranche de 75 000 FCFA sont à payer désormais par Orange Money au 690 45 45 45 (Mme le Censeur). Dernier délai demain.', num('+237690454545')],
  // fake hospital emergency
  ["Bonjour, votre enfant a eu un accident à l'école, il est à l'hôpital Laquintinie. Envoyez 50 000 FCFA au 677 23 23 23 pour les soins urgents.", num('+237677232323')],
  ['Mama, na your pikin get accident for road, e dey hospital now. Send 30,000 quick quick for this number make dem treat am.', num('+237652525252')],
  // USSD trick
  ['Pour annuler la transaction erronée, tapez *126*1*1*650112233*25000# et confirmez avec votre code.', num('+237650112200')],
  // WhatsApp code theft
  ['Bonjour, je vous ai envoyé un code à 6 chiffres par erreur, pouvez-vous me le renvoyer svp? C\'est urgent.', num('+237677998877')],
  ["Hi, sorry I sent a 6-digit code to your number by mistake. Please forward it to me, it is for my WhatsApp.", num('+237699887700')],
  // fake ENEO technician
  ["ENEO: Votre compteur présente une fraude. Notre technicien passera demain. Payez 25 000 FCFA d'amende au 698 76 54 32 pour éviter la coupure.", num('+237698765432')],
  // more job fees, code theft, crypto, fake teacher, SIM code
  ['Recrutement SONARA 2026. Frais de dossier: 15 000 FCFA. Contact WhatsApp 677 88 99 00.', num('+237677889900')],
  ['Désolé, je me suis trompé de numéro en envoyant un code WhatsApp. Renvoie-le moi stp.', num('+237690909090')],
  ['Rejoignez notre groupe crypto: placez 50 000 FCFA, récupérez 150 000 FCFA en 3 jours.', num('+237677120120')],
  ["Bonjour parent, je suis l'enseignant de votre enfant. Envoyez 5 000 FCFA pour les fournitures au 691 22 33 44.", num('+237691223344')],
  ['Orange Cameroun: mise à jour de votre SIM. Communiquez le code que vous allez recevoir pour éviter la suspension de votre ligne.', num('+237699111222')],
  // fake landlord new number
  ["Bonjour, c'est votre bailleur. J'ai changé de numéro. Envoyez désormais le loyer de 40 000 FCFA sur ce numéro par Orange Money.", num('+237655667788')],
];


const GENUINE: [string, S][] = [
  ['Votre code de confirmation Orange Money est 583920. Ne le partagez avec personne.', name('Orange Money')],
  ['Your WhatsApp code: 482-193. Do not share this code with anyone.', name('WhatsApp')],
  ['ENEO informe sa clientèle de Bonamoussadi d\'une interruption de fourniture le 25/11/2026 de 8h à 15h pour travaux de maintenance.', name('ENEO')],
  ['Afriland First Bank: Votre compte xxxx4521 a été crédité de 150 000 FCFA le 18/11/2026. Solde disponible: 312 450 FCFA.', name('AFRILAND')],
  ['UBA: Debit alert. Acct ****7712. Amount 25,000 XAF. ATM withdrawal Bonanjo. Bal 98,300 XAF.', name('UBA')],
  ['Rappel tontine: la réunion des Mamans Solidaires est dimanche 22/11 chez Mme Ngo à 15h. Apportez votre cotisation de 10 000 FCFA.', num('+237677445566')],
  ['Bonjour tonton, c\'est Brice. Appelle-moi quand tu as un moment, rien de grave, c\'est pour la réunion de famille.', num('+237699001122')],
  ['Anciens élèves du Lycée Leclerc promo 2006: retrouvailles le samedi 5 décembre au Hilton. Confirmez votre présence à Paul.', num('+237670556677')],
  ['Mama, I reach home safe. Call me when you wake up, I want to tell you about the job interview.', num('+237681112233')],
  ['Collège Saint Michel: la 2e tranche de 75 000 FCFA est à payer à l\'économat ou à la banque avant le 15/12/2026.', name('COLLEGE ST MICHEL')],
  ['MTN: Vous avez reçu un bonus de 500 Mo valable 7 jours suite à votre recharge. Merci de votre fidélité.', name('MTN')],
  ['Your DHL shipment 4829173 is out for delivery today. Track it on dhl.com.', name('DHL')],
  ['Les parents sont invités à la réunion APEE le samedi 28/11 à 10h dans la salle des fêtes du lycée.', name('LYCEE BILINGUE')],
  ['Recrutement de 5 chauffeurs à Douala. Salaire 150 000 FCFA. Envoyez votre CV au 677 12 34 56.', num('+237677123456')],
  ['We are recruiting sales agents. Salary 120,000 FCFA plus commission. Call 677 11 22 33 for an interview.', num('+237677112233')],
  ["Félicitations, vous êtes admis à l'ENS de Yaoundé. Les frais d'inscription de 50 000 FCFA se payent à la banque. Infos au 222 22 30 05.", name('ENS YAOUNDE')],
  ['Papa a eu un petit accident mais il va bien, il est à l\'hôpital de district. Passe le voir demain.', num('+237655001122')],
  ["Your verification code is 739204. If you received this message by mistake, please ignore it.", name('Google')],
  ['MTN: Someone may say they sent you a code by mistake and ask you to send it back. Never do it.', name('MTN')],
  ["I am stuck at the airport, the flight is delayed until tomorrow. Don't worry, I will call you when I land.", num('+237699554433')],
  ['Afriland First Bank: votre prêt de 2 000 000 FCFA a été approuvé. Passez à votre agence pour signer le contrat. Frais de dossier 25 000 FCFA prélevés sur votre compte.', name('AFRILAND')],
];


describe('probe 14: Cameroon scam patterns', () => {
  it.each(SCAMS)('warns: %s', (t, s) => {
    expect(assess(t, s).level).not.toBe('no_signs');
  });
  it.each(GENUINE)('no signs: %s', (t, s) => {
    expect(assess(t, s).level).toBe('no_signs');
  });
});

describe('probe 14: the misses it found', () => {
  it('recruitment with a fee and a personal number is offer_fee (likely scam), even with no pay verb', () => {
    for (const t of [
      'Recrutement spécial armée camerounaise 2026: 500 places. Contactez le Colonel au 655 44 33 22, prévoir 150 000 FCFA pour garantir votre place.',
      'Recrutement SONARA 2026. Frais de dossier: 15 000 FCFA. Contact WhatsApp 677 88 99 00.',
    ]) {
      const r = assess(t, num());
      expect(r.signals, t).toContain('offer_fee');
      expect(r.level, t).toBe('likely_scam');
    }
  });
  it('offer_fee needs a personal number: a real admission paid at the bank, a real loan at the agency stay quiet', () => {
    expect(assess("Félicitations, vous êtes admis à l'ENS de Yaoundé. Les frais d'inscription de 50 000 FCFA se payent à la banque.", num()).level).toBe('no_signs');
    expect(assess('Votre prêt de 2 000 000 FCFA a été approuvé. Frais de dossier 25 000 FCFA prélevés sur votre compte.', name('AFRILAND')).level).toBe('no_signs');
  });
  it('a job advert that says "send your CV to 677..." next to a salary is not a payment', () => {
    expect(assess('Recrutement de 5 chauffeurs à Douala. Salaire 150 000 FCFA. Envoyez votre CV au 677 12 34 56.', num()).level).toBe('no_signs');
    // but sending money to the same kind of number still warns
    expect(assess('Recrutement de 5 chauffeurs. Envoyez 10 000 FCFA au 677 12 34 56 pour votre badge.', num()).level).toBe('likely_scam');
  });
  it('a code "sent by mistake" and asked back in the next sentence asks for the secret', () => {
    const r = assess('Hi, sorry I sent a 6-digit code to your number by mistake. Please forward it to me, it is for my WhatsApp.', num());
    expect(r.signals).toContain('asks_pin');
    expect(r.level).toBe('likely_scam');
  });
  it("an operator's warning about that trick is not the trick", () => {
    expect(assess('MTN: Someone may say they sent you a code by mistake and ask you to send it back. Never do it.', name('MTN')).level).toBe('no_signs');
    // the same words from a mobile number keep the warning
    expect(assess('I sent you a code by mistake and you must send it back. Never mind the time.', num()).level).not.toBe('no_signs');
  });
  it('"the code you will receive" is a secret asked in advance (SIM swap)', () => {
    const r = assess('Dear customer, your SIM will be deactivated today. Reply with your ID card number and the code you will receive to keep your line.', num());
    expect(r.signals).toContain('asks_pin');
  });
  it('an emergency story that asks money from a mobile number is distress_money (a caution on its own)', () => {
    const r = assess('My love, I am stuck at the airport in Paris, they seized my luggage. Please send me 200,000 FCFA through Western Union today, I will pay you back when I land.', num());
    expect(r.signals).toEqual(['distress_money']);
    expect(r.level).toBe('caution');
    const p = assess('Mama, na your pikin get accident for road, e dey hospital now. Send 30,000 quick quick for this number make dem treat am.', num());
    expect(p.signals).toContain('distress_money');
    expect(p.level).toBe('likely_scam');
  });
  it('the same story with no money asked stays quiet', () => {
    expect(assess("I am stuck at the airport, the flight is delayed until tomorrow. Don't worry, I will call you when I land.", num()).level).toBe('no_signs');
    expect(assess("Papa a eu un petit accident mais il va bien, il est à l'hôpital de district. Passe le voir demain.", num()).level).toBe('no_signs');
  });
});

describe('probe 14: known trade-offs (kept honest)', () => {
  it('a real relative asking money for the hospital from a mobile number gets a caution', () => {
    // Indistinguishable in text from the fake-emergency scam. The caution only says to call back on the number you
    // already know; it never says the message is a scam.
    expect(assess('Maman, Junior est hospitalisé à Laquintinie, envoie 20 000 FCFA pour les médicaments.', num()).level).toBe('caution');
  });
  it('a tontine collector asking to send the contribution "sur ce numéro" stays flagged', () => {
    // Same words as the probe-13 scam "Envoie-moi 15 000 FCFA sur ce numéro"; like the landlord case in
    // probe-sms-fr.test.ts, a missed scam costs more than this false alarm.
    expect(assess('Tontine des jeunes: envoie ta cotisation de 10 000 FCFA sur ce numéro avant dimanche.', num('+237677445566')).level).not.toBe('no_signs');
  });
  it('a real result notice with a link from a name not on the official list keeps the link caution', () => {
    // Labelling rule (probe 8): a link from an unverified sender is always a caution, never more.
    const r = assess("MINFOPRA: les résultats du concours de recrutement des contractuels sont disponibles sur www.minfopra.gov.cm. Aucun frais n'est exigé.", name('MINFOPRA'));
    expect(r.signals).toEqual(['link']);
    expect(r.level).toBe('caution');
  });
});
