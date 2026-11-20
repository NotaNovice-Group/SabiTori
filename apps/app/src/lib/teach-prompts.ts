/**
 * What people are invited to teach: everyday greetings first (easy, a good start), then the words SabiTori most needs
 * to read and speak messages in local languages (numbers, days, money, deadlines, scam warnings).
 */
export interface Prompt {
  id: string;
  en: string;
  fr: string;
}

export const PROMPTS: Prompt[] = [
  { id: 'greet.morning', en: 'Good morning', fr: 'Bonjour (le matin)' },
  { id: 'greet.evening', en: 'Good evening', fr: 'Bonsoir' },
  { id: 'greet.how', en: 'How are you?', fr: 'Comment vas-tu ?' },
  { id: 'greet.thanks', en: 'Thank you', fr: 'Merci' },
  { id: 'greet.welcome', en: 'You are welcome', fr: 'Je t’en prie' },
  { id: 'greet.bye', en: 'Goodbye', fr: 'Au revoir' },
  { id: 'yes', en: 'Yes', fr: 'Oui' },
  { id: 'no', en: 'No', fr: 'Non' },
  { id: 'msg.pay_before', en: 'You must pay before Friday.', fr: 'Vous devez payer avant vendredi.' },
  { id: 'msg.scam', en: 'This message is a scam. Do not send money.', fr: 'Ce message est une arnaque. N’envoyez pas d’argent.' },
  { id: 'msg.pin', en: 'Never give your secret code to anyone.', fr: 'Ne donnez jamais votre code secret à personne.' },
  { id: 'msg.bill', en: 'Your electricity bill has arrived.', fr: 'Votre facture d’électricité est arrivée.' },
  { id: 'msg.water', en: 'There will be no water tomorrow.', fr: 'Il n’y aura pas d’eau demain.' },
  { id: 'msg.hospital', en: 'Go to the hospital on Monday.', fr: 'Allez à l’hôpital lundi.' },
  { id: 'msg.school', en: 'School fees are due this week.', fr: 'Les frais de scolarité sont à payer cette semaine.' },
  { id: 'msg.money_received', en: 'You have received money.', fr: 'Vous avez reçu de l’argent.' },
  { id: 'msg.call', en: 'Call this number for help.', fr: 'Appelez ce numéro pour de l’aide.' },
  { id: 'msg.urgent', en: 'This is urgent.', fr: 'C’est urgent.' },
  { id: 'msg.nothing', en: 'You do not need to do anything.', fr: 'Vous n’avez rien à faire.' },
  { id: 'msg.listen', en: 'Listen to the message.', fr: 'Écoutez le message.' },
  { id: 'day.monday', en: 'Monday', fr: 'Lundi' },
  { id: 'day.tuesday', en: 'Tuesday', fr: 'Mardi' },
  { id: 'day.wednesday', en: 'Wednesday', fr: 'Mercredi' },
  { id: 'day.thursday', en: 'Thursday', fr: 'Jeudi' },
  { id: 'day.friday', en: 'Friday', fr: 'Vendredi' },
  { id: 'day.saturday', en: 'Saturday', fr: 'Samedi' },
  { id: 'day.sunday', en: 'Sunday', fr: 'Dimanche' },
  { id: 'time.today', en: 'Today', fr: 'Aujourd’hui' },
  { id: 'time.tomorrow', en: 'Tomorrow', fr: 'Demain' },
  { id: 'num.1', en: 'One', fr: 'Un' },
  { id: 'num.2', en: 'Two', fr: 'Deux' },
  { id: 'num.3', en: 'Three', fr: 'Trois' },
  { id: 'num.5', en: 'Five', fr: 'Cinq' },
  { id: 'num.10', en: 'Ten', fr: 'Dix' },
  { id: 'num.100', en: 'One hundred', fr: 'Cent' },
  { id: 'num.1000', en: 'One thousand', fr: 'Mille' },
  { id: 'money.francs', en: 'Five thousand francs', fr: 'Cinq mille francs' },
];

/** Same prompt all day for everyone, a new one the next day (people can still pick another). */
export function promptOfTheDay(date = new Date()): number {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
  return day % PROMPTS.length;
}

/** Languages of the region people can teach, by name as speakers write it. 'other' lets them name their own. */
export const TEACH_LANGS: { tag: string; name: string }[] = [
  { tag: 'wes', name: 'Pidgin (Kamtok)' },
  { tag: 'dua', name: 'Duala' },
  { tag: 'ewo', name: 'Ewondo' },
  { tag: 'fub', name: 'Fulfulde' },
  { tag: 'bas', name: 'Basaa' },
  { tag: 'bum', name: 'Bulu' },
  { tag: 'lns', name: 'Lamnso’' },
  { tag: 'lmp', name: 'Limbum' },
  { tag: 'ybb', name: 'Yemba' },
  { tag: 'bbj', name: 'Ghomálá’' },
  { tag: 'mua', name: 'Mundang' },
  { tag: 'ksf', name: 'Bafia' },
  { tag: 'ar', name: 'Arabe tchadien / Chadian Arabic' },
];
