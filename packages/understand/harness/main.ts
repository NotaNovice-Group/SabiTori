import { createLlmClassifier } from '../src/index';
const fallback = { id: 'stub', classify: async () => ({ kind: 'other', action: 'unclear', urgency: 'info', confidence: 0, producedBy: 'stub' }) } as any;
const cases: [string, string][] = [
  ['eneo', "ENEO: Cher client, votre facture N° 2026110045 d'un montant de 18 450 FCFA est disponible. Veuillez régler avant le 25/11/2026 pour éviter la coupure."],
  ['camwater', "CAMWATER: Avis de coupure. Votre abonnement sera suspendu le 05/11/2026 faute de paiement de 9 800 FCFA."],
  ['momo-scam', "Bonjour, je vous ai envoye 25 000 FCFA par erreur sur votre compte MTN MoMo. Svp renvoyez au 677123456 rapidement. Merci"],
  ['prize', "Felicitations! Vous avez gagne 500 000 FCFA au jeu Orange. Envoyez 2 000 F de frais et votre code secret pour recevoir."],
  ['hospital', "Hopital Laquintinie: rendez-vous de consultation le 12 novembre 2026 a 9h. Apportez votre carnet de sante."],
  ['school', "Dear parent, school fees of 45,000 FCFA for the second term must be paid before 30 November 2026."],
  ['id', "DGSN: Votre carte nationale d'identite est prete. Venez la retirer au commissariat avec votre recepisse."],
  ['receipt', "Transfert recu de 10 000 FCFA de JEAN P. (6xxxxxx12). Nouveau solde: 34 500 FCFA. Ref: MP261031.1234."],
];
(async () => {
  const t0 = performance.now();
  const clf = await createLlmClassifier({ model: await (await fetch('/model.gguf')).blob(), fallback, wasmBaseUrl: '/wllama/', timeoutMs: 120000 });
  console.log('LOADED_MS', Math.round(performance.now() - t0));
  for (const [id, text] of cases) {
    const s = performance.now();
    const u = await clf.classify({ text, source: 'paste', receivedAt: '2026-10-31', region: 'CM' } as any, { lang: 'fr', dates: [], amounts: [], phones: [], references: [], urls: [], ussdCodes: [] });
    console.log('RESULT', id, JSON.stringify(u), Math.round(performance.now() - s) + 'ms');
  }
  console.log('DONE');
})().catch(e => console.log('ERROR', e?.stack || e));
