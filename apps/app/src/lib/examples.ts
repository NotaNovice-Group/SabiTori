import type { MessageInput } from '@sabitori/core';
import type { ExtraKey } from '../engine/extra';

/**
 * Six made-up but realistic messages for practice, onboarding and partner
 * training. Dates are relative to today so they stay in the future. The text is
 * message content (it is what a phone receives), not interface text.
 */
export interface Example {
  id: string;
  titleKey: ExtraKey;
  build(today: Date): Pick<MessageInput, 'text' | 'sender'>;
}

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function frDate(base: Date, plusDays: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + plusDays));
  return `${d.getUTCDate()} ${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const EXAMPLES: Example[] = [
  {
    id: 'eneo',
    titleKey: 'app.example.eneo',
    build: (t) => ({
      sender: { kind: 'name', value: 'ENEO' },
      text: `ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: ${frDate(t, 9)}. Évitez la coupure. Service client: 677 00 12 34.`,
    }),
  },
  {
    id: 'camwater',
    titleKey: 'app.example.camwater',
    build: (t) => ({
      sender: { kind: 'name', value: 'CAMWATER' },
      text: `CAMWATER: Avis de coupure. Votre facture d'eau de 7 200 FCFA est impayée. Réglez avant le ${frDate(t, 3)} pour éviter la suspension de votre branchement. Appelez le 699 40 11 22.`,
    }),
  },
  {
    id: 'momo',
    titleKey: 'app.example.momo',
    build: () => ({
      sender: { kind: 'number', value: '650 55 66 77' },
      text: `Vous avez reçu 25 000 FCFA de Jean Paul. Il s'agit d'une erreur, merci de me renvoyer l'argent immédiatement. Appelez-moi vite au 650 55 66 77.`,
    }),
  },
  {
    id: 'prize',
    titleKey: 'app.example.prize',
    build: () => ({
      sender: { kind: 'number', value: '690 11 22 33' },
      text: `FELICITATIONS! Vous avez gagné 2 000 000 FCFA au grand tirage MTN. Pour recevoir votre gain, envoyez 5 000 FCFA et donnez votre code PIN au 690 11 22 33 dans les 10 minutes. http://mtn-gain.example/prix`,
    }),
  },
  {
    id: 'hospital',
    titleKey: 'app.example.hospital',
    build: (t) => ({
      sender: { kind: 'name', value: 'Hôpital Régional' },
      text: `Hôpital Régional: Votre rendez-vous de consultation est fixé au ${frDate(t, 5)} à 9h00. Apportez votre carnet de santé et votre carte d'identité. Info: 677 20 30 40.`,
    }),
  },
  {
    id: 'school',
    titleKey: 'app.example.school',
    build: (t) => ({
      sender: { kind: 'name', value: 'Lycée Bilingue' },
      text: `Lycée Bilingue: La deuxième tranche des frais de scolarité, 45 000 FCFA, est à payer avant le ${frDate(t, 20)} au bureau de l'économe. Info: 699 12 12 12.`,
    }),
  },
];

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
