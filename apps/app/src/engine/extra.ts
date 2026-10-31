/**
 * Interface strings the shared phrase catalog does not have yet.
 *
 * They live here, in the same shape as the catalog (en source + context), with a
 * French rendering, so maintainers can move them into packages/core/src/catalog.ts
 * and the packs as one batch. Until a language pack provides a key, the app falls
 * back through the pack's own fallback chain and then to fr / en from this table.
 * {name}-style slots are replaced by the app.
 */
export interface ExtraEntry {
  en: string;
  fr: string;
  context: string;
}

const x = <T extends Record<string, ExtraEntry>>(t: T) => t;

export const EXTRA = x({
  'app.next': { en: 'Next', fr: 'Suivant', context: 'Button: go to the next step.' },
  'app.mode.title': { en: 'How do you use messages?', fr: 'Comment utilisez-vous les messages ?', context: 'Question on first run.' },
  'app.mode.listen': { en: 'I listen', fr: "J'écoute", context: 'Choice: the phone speaks everything.' },
  'app.mode.listen_hint': {
    en: 'The phone speaks the message and every button.',
    fr: 'Le téléphone lit le message et chaque bouton à voix haute.',
    context: 'Explains listen-first mode.',
  },
  'app.mode.read': { en: 'I read', fr: 'Je lis', context: 'Choice: the person reads; sound only when asked.' },
  'app.mode.read_hint': {
    en: 'The message is shown. Press Listen to hear it.',
    fr: 'Le message est affiché. Appuyez sur Écouter pour l’entendre.',
    context: 'Explains read mode.',
  },
  'app.lang.soon': {
    en: 'Voice coming soon, {name} for now',
    fr: 'Voix bientôt disponible, {name} pour le moment',
    context: 'Language whose recording is not finished. {name} is the language that is spoken meanwhile.',
  },
  'app.tap_again': { en: 'Tap again to do it', fr: 'Appuyez encore pour le faire', context: 'Shown on a button after its first tap in listen-first mode.' },
  'app.home.empty': { en: 'No messages yet', fr: 'Pas encore de message', context: 'Empty history.' },
  'app.home.empty_hint': {
    en: 'A message you read with SabiTori is kept here, on this phone only.',
    fr: 'Un message lu avec SabiTori est gardé ici, sur ce téléphone seulement.',
    context: 'Empty history explanation.',
  },
  'app.practice': { en: 'Practice with an example', fr: 'S’entraîner avec un exemple', context: 'Quiet entry on the home screen.' },
  'app.practice.title': { en: 'Practice messages', fr: 'Messages d’entraînement', context: 'Screen title.' },
  'app.practice.hint': { en: 'These messages are made up.', fr: 'Ces messages sont inventés.', context: 'Under the practice list.' },
  'app.practice.badge': { en: 'Practice message', fr: 'Message d’entraînement', context: 'Shown on a card opened from the practice list.' },
  'app.example.eneo': { en: 'Electricity bill', fr: 'Facture d’électricité', context: 'Practice message title.' },
  'app.example.camwater': { en: 'Water cut-off notice', fr: 'Avis de coupure d’eau', context: 'Practice message title.' },
  'app.example.momo': { en: 'Money sent by mistake', fr: 'Argent envoyé par erreur', context: 'Practice message title (a scam).' },
  'app.example.prize': { en: 'Prize and secret code', fr: 'Gain et code secret', context: 'Practice message title (a scam).' },
  'app.example.hospital': { en: 'Hospital appointment', fr: 'Rendez-vous à l’hôpital', context: 'Practice message title.' },
  'app.example.school': { en: 'School fees', fr: 'Frais de scolarité', context: 'Practice message title.' },
  'app.paste.label': { en: 'The message', fr: 'Le message', context: 'Label of the text box.' },
  'app.paste.placeholder': { en: 'Paste or type the message here', fr: 'Collez ou écrivez le message ici', context: 'Text box hint.' },
  'app.paste.sender': { en: 'Who sent it?', fr: 'Qui l’a envoyé ?', context: 'Question about the sender.' },
  'app.paste.sender.name': { en: 'A name', fr: 'Un nom', context: 'Choice.' },
  'app.paste.sender.number': { en: 'A number', fr: 'Un numéro', context: 'Choice.' },
  'app.paste.sender.unknown': { en: 'I do not know', fr: 'Je ne sais pas', context: 'Choice.' },
  'app.paste.sender.name_label': { en: 'Name of the sender', fr: 'Nom de l’expéditeur', context: 'Input label.' },
  'app.paste.sender.number_label': { en: 'Number of the sender', fr: 'Numéro de l’expéditeur', context: 'Input label.' },
  'app.paste.go': { en: 'Explain this message', fr: 'Expliquer ce message', context: 'Main button on the paste screen.' },
  'app.capture.checking': { en: 'Checking the photo', fr: 'Vérification de la photo', context: 'Shown while the photo sharpness is measured.' },
  'app.capture.again': { en: 'Take the photo again', fr: 'Reprendre la photo', context: 'Button.' },
  'app.capture.use': { en: 'Use this photo anyway', fr: 'Utiliser cette photo quand même', context: 'Button.' },
  'app.capture.empty': {
    en: 'We could not read any words in this photo.',
    fr: 'Nous n’avons lu aucun mot sur cette photo.',
    context: 'OCR found no text.',
  },
  'app.capture.failed': { en: 'Reading failed. Please try again.', fr: 'La lecture a échoué. Essayez encore.', context: 'Unexpected error.' },
  'app.card.not_found': { en: 'This message is no longer here.', fr: 'Ce message n’est plus ici.', context: 'Card id not found.' },
  'app.card.fallback_note': { en: 'Spoken in {name}', fr: 'Dit en {name}', context: 'This part is not yet available in the chosen language.' },
  'app.urgency.info': { en: 'Information', fr: 'Information', context: 'One-word urgency label (green).' },
  'app.urgency.soon': { en: 'Soon', fr: 'Bientôt', context: 'One-word urgency label (amber).' },
  'app.urgency.urgent': { en: 'Urgent', fr: 'Urgent', context: 'One-word urgency label (red).' },
  'app.scam.title': { en: 'Warning', fr: 'Attention', context: 'Word on the scam block.' },
  'app.fact.reference': { en: 'Reference', fr: 'Référence', context: 'Label of a reference number.' },
  'app.sender.unknown': { en: 'Unknown sender', fr: 'Expéditeur inconnu', context: 'History row without sender.' },
  'app.close': { en: 'Close', fr: 'Fermer', context: 'Button.' },
  'app.original': { en: 'The message as written', fr: 'Le message tel qu’il est écrit', context: 'Title of the source sheet.' },
  'app.settings.listen_first': { en: 'Listen first', fr: 'Écouter d’abord', context: 'Setting name.' },
  'app.settings.listen_first_hint': {
    en: 'A button speaks its name on the first tap and acts on the second.',
    fr: 'Un bouton dit son nom au premier appui et agit au deuxième.',
    context: 'Setting explanation.',
  },
  'app.settings.on': { en: 'On', fr: 'Oui', context: 'Switch state.' },
  'app.settings.off': { en: 'Off', fr: 'Non', context: 'Switch state.' },
  'app.settings.speed': { en: 'Speaking speed', fr: 'Vitesse de la voix', context: 'Setting name.' },
  'app.settings.speed.normal': { en: 'Normal', fr: 'Normale', context: 'Speed step.' },
  'app.settings.speed.slow': { en: 'Slow', fr: 'Lente', context: 'Speed step.' },
  'app.settings.speed.slower': { en: 'Very slow', fr: 'Très lente', context: 'Speed step.' },
  'app.settings.history': { en: 'Keep my messages', fr: 'Garder mes messages', context: 'Setting name.' },
  'app.settings.history.30': { en: '30 days', fr: '30 jours', context: 'Option.' },
  'app.settings.history.7': { en: '7 days', fr: '7 jours', context: 'Option.' },
  'app.settings.history.0': { en: 'Do not keep', fr: 'Ne pas garder', context: 'Option.' },
  'app.settings.model': { en: 'Understanding model', fr: 'Modèle de compréhension', context: 'Setting name.' },
  'app.settings.model.none': {
    en: 'Not added. The phone uses simple rules.',
    fr: 'Pas ajouté. Le téléphone utilise des règles simples.',
    context: 'Model status.',
  },
  'app.settings.model.ready': { en: 'Added, {size}', fr: 'Ajouté, {size}', context: 'Model status. {size} like "1.0 GB".' },
  'app.settings.model.loading': { en: 'Getting the model ready', fr: 'Préparation du modèle', context: 'Model status.' },
  'app.settings.model.active': { en: 'Ready to use', fr: 'Prêt à servir', context: 'Model status.' },
  'app.settings.model.failed': { en: 'Could not start. Simple rules are used.', fr: 'Démarrage impossible. Les règles simples sont utilisées.', context: 'Model status.' },
  'app.settings.model.add': { en: 'Add a model file', fr: 'Ajouter un fichier modèle', context: 'Button.' },
  'app.settings.model.remove': { en: 'Remove the model file', fr: 'Retirer le fichier modèle', context: 'Button.' },
  'app.settings.model.saving': { en: 'Saving the file', fr: 'Enregistrement du fichier', context: 'Model status.' },
  'app.settings.model.err.not_gguf': { en: 'This file is not a model file.', fr: 'Ce fichier n’est pas un fichier modèle.', context: 'Error.' },
  'app.settings.model.err.unavailable': { en: 'This phone cannot keep a model file.', fr: 'Ce téléphone ne peut pas garder un fichier modèle.', context: 'Error.' },
  'app.settings.model.err.write_failed': { en: 'The file was not saved. The phone may be full.', fr: 'Le fichier n’a pas été enregistré. Le téléphone est peut-être plein.', context: 'Error.' },
  'app.settings.model.note': {
    en: 'This extra model is optional. It can be slow on some phones. Without it, SabiTori still reads messages with simple rules.',
    fr: 'Ce modèle supplémentaire est facultatif. Il peut être lent sur certains téléphones. Sans lui, SabiTori lit quand même les messages avec des règles simples.',
    context: 'Plain statement under the understanding model setting.',
  },
  'app.card.checking': { en: 'Checking more carefully', fr: 'Vérification plus attentive', context: 'Quiet line on a card while the extra model re-reads a message the simple rules could not understand.' },
  'app.card.improved': { en: 'We understood more of this message. You can listen again.', fr: 'Nous avons mieux compris ce message. Vous pouvez écouter encore.', context: 'Shown when the careful check produced a better card.' },
  'app.settings.privacy': { en: 'Privacy', fr: 'Confidentialité', context: 'Section name.' },
  'app.settings.privacy_body': {
    en: 'Photos, texts and voices stay on this phone. SabiTori does not use the internet to read a message. Your history can be deleted at any time.',
    fr: 'Les photos, les textes et les voix restent sur ce téléphone. SabiTori n’utilise pas internet pour lire un message. Vous pouvez effacer votre historique à tout moment.',
    context: 'Privacy explanation.',
  },
  'app.settings.version': { en: 'Version', fr: 'Version', context: 'Label.' },
  'app.settings.clear': { en: 'Delete all my messages', fr: 'Effacer tous mes messages', context: 'Button.' },
  'app.settings.cleared': { en: 'Deleted', fr: 'Effacé', context: 'Confirmation.' },
} as const);

export type ExtraKey = keyof typeof EXTRA;
export const EXTRA_KEYS = Object.keys(EXTRA) as ExtraKey[];

export function isExtraKey(key: string): key is ExtraKey {
  return key in EXTRA;
}
