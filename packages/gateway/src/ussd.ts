import type { RegionConfig } from '@sabitori/core';

/**
 * A USSD menu any phone can use, with no internet and no app: dial a short code, pick a number, read the answer.
 * Stateless: the provider sends the whole path typed so far ("1*2"); the reply starts with CON (menu goes on) or
 * END (session closes). USSD screens hold about 160 characters, so every screen is short and GSM-7 only.
 */
type L = 'fr' | 'en';
const T = {
  welcome: { fr: 'SabiTori\n1 Arnaque ? Verifier un numero\n2 Conseils anti-arnaque\n3 Lire un SMS: comment faire\n9 English', en: 'SabiTori\n1 Scam? Check a number\n2 Tips against scams\n3 Read an SMS: how\n9 Francais' },
  askNumber: { fr: 'Tapez le numero qui vous a appele ou ecrit:', en: 'Type the number that called or texted you:' },
  badNumber: { fr: 'Numero non reconnu. Tapez 9 chiffres, ex. 677123456.', en: 'Number not recognised. Type 9 digits, e.g. 677123456.' },
  mobile: {
    fr: 'Numero mobile ordinaire. Une entreprise ne demande jamais d argent ni de code secret depuis un tel numero. Ne payez pas, ne donnez pas votre PIN.',
    en: 'An ordinary mobile number. A company never asks for money or your PIN from such a number. Do not pay, do not share your PIN.',
  },
  fixed: {
    fr: 'Numero fixe. Nous ne pouvons pas confirmer qui c est. Rappelez le numero officiel ecrit sur votre facture ou votre carte.',
    en: 'A landline. We cannot confirm who it is. Call back the official number printed on your bill or card.',
  },
  tips: {
    fr: '1 Ne donnez jamais votre PIN.\n2 Gain contre des frais = arnaque.\n3 "Envoye par erreur, renvoyez" = arnaque.\n4 Verifiez votre solde avec le code de votre operateur.',
    en: '1 Never share your PIN.\n2 A prize that costs a fee = scam.\n3 "Sent by mistake, send it back" = scam.\n4 Check your balance with your operator s own code.',
  },
  how: {
    fr: 'Transferez le SMS douteux au numero SabiTori. Vous recevez la reponse par SMS: qui, quoi, combien, quand, et si c est une arnaque.',
    en: 'Forward the doubtful SMS to the SabiTori number. You get the answer by SMS: who, what, how much, when, and whether it is a scam.',
  },
  bad: { fr: 'Choix inconnu. Recomposez le code.', en: 'Unknown choice. Dial the code again.' },
} as const;

export function ussd(path: string, region: RegionConfig): string {
  let steps = path.split('*').map((s) => s.trim()).filter((s) => s !== '');
  let lang: L = 'fr';
  // "9" switches language and returns to the menu; it can be chosen again.
  while (steps[0] === '9') {
    lang = lang === 'fr' ? 'en' : 'fr';
    steps = steps.slice(1);
  }
  const t = (k: keyof typeof T) => T[k][lang];
  if (steps.length === 0) return `CON ${t('welcome')}`;
  const [choice, arg] = steps;
  if (choice === '1') {
    if (arg === undefined) return `CON ${t('askNumber')}`;
    const digits = arg.replace(/\D/g, '').replace(new RegExp(`^(00)?${region.phone.countryCode}`), '');
    if (!new RegExp(`^(?:${region.phone.nationalPattern})$`).test(digits)) return `END ${t('badNumber')}`;
    const mobile = (region.phone.mobilePrefixes ?? ['6']).some((p) => digits.startsWith(p));
    return `END ${t(mobile ? 'mobile' : 'fixed')}`;
  }
  if (choice === '2') return `END ${t('tips')}`;
  if (choice === '3') return `END ${t('how')}`;
  return `END ${t('bad')}`;
}
