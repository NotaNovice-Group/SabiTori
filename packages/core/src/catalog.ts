/**
 * The phrase catalog: every sentence SabiTori can say or show.
 *
 * This is the source of truth for translators and voice recorders. Each
 * language pack provides text (and, for recorded languages, audio) for
 * these keys. English here is the *source*, not a fallback: a pack's own
 * fallback chain decides what plays when a phrase is missing.
 *
 * Slots are written {name}. Translators may move slots anywhere in the
 * sentence; the speech package renders slot values with the pack's own
 * number, date and money rules.
 *
 * Rules for adding a phrase:
 * - Short, concrete, one idea. Spoken first, read second.
 * - Never claim safety. Never give advice beyond "ask", "call", "check".
 * - Add `context` that a translator who has never seen the app understands.
 */

export interface CatalogEntry {
  en: string;
  context: string;
  slots?: readonly string[];
}

const c = <T extends Record<string, CatalogEntry>>(t: T) => t;

export const CATALOG = c({
  /* ---------- Scam warnings: always spoken first when present ---------- */
  'scam.likely': {
    en: 'This looks like a trick. Do not send money. Do not share your PIN.',
    context: 'Strongest warning. Said when the message is very likely a scam.',
  },
  'scam.caution': {
    en: 'Be careful. Check before you do anything.',
    context: 'Medium warning. One weaker scam sign was found.',
  },
  'scam.no_signs': {
    en: 'We found no warning signs. Never share your PIN with anyone.',
    context: 'Said for money messages with no scam signs. Must NOT say the message is safe.',
  },
  'scam.check_balance': {
    en: "Check your balance with your operator's own code, not with a number from this message.",
    context: 'Advice after a scam warning about mobile money.',
  },
  'scam.signal.asks_pin': {
    en: 'This message asks for your secret code.',
    context: 'Reason for the warning: it asks for a PIN or password.',
  },
  'scam.signal.wrong_transfer': {
    en: 'This message says money was sent to you by mistake.',
    context: 'Reason: the common "I sent you money by mistake, send it back" trick.',
  },
  'scam.signal.prize_fee': {
    en: 'This message says you won something, but you must pay first.',
    context: 'Reason: fake prize or lottery that asks for a fee.',
  },
  'scam.signal.account_block_threat': {
    en: 'This message threatens to block your account or SIM card.',
    context: 'Reason: threat used to frighten people into acting.',
  },
  'scam.signal.link': {
    en: 'This message has a link. Do not open it.',
    context: 'Reason: the message contains a web link.',
  },
  'scam.signal.time_pressure': {
    en: 'This message pushes you to act very fast.',
    context: 'Reason: pressure such as "within 10 minutes".',
  },
  'scam.signal.sender_mismatch': {
    en: "It says it is from {sender}, but it does not come from {sender}'s real number.",
    context: 'Reason: claims to be an official company but came from an ordinary number.',
    slots: ['sender'],
  },
  'scam.signal.fake_balance': {
    en: 'This balance message does not come from your operator.',
    context: 'Reason: a fake "you received money" message.',
  },
  'scam.signal.asks_to_call_number': {
    en: 'This message asks you to call a number. Use the official number instead.',
    context: 'Reason: asks the person to call an unofficial number.',
  },

  'scam.signal.ussd_instruction': {
    en: 'This message tells you to dial a code. Codes like this can send your money away.',
    context: 'Reason: the message asks the person to dial a USSD code such as *126*...#.',
  },
  'scam.signal.pay_to_personal_number': {
    en: 'This message asks you to send money to a personal phone number.',
    context: 'Reason: money is requested to an ordinary mobile number, not an official account.',
  },

  /* ---------- Sender ---------- */
  'sender.known': {
    en: 'This message is from {sender}.',
    context: 'The sender matches the official list.',
    slots: ['sender'],
  },
  'sender.claimed': {
    en: 'This message says it is from {sender}.',
    context: 'The message names a sender we could not confirm.',
    slots: ['sender'],
  },
  'sender.unknown': {
    en: 'We do not know who sent this message.',
    context: 'No sender found.',
  },

  /* ---------- What it is about ---------- */
  'about.electricity_bill': { en: 'It is about your electricity bill.', context: 'Message type.' },
  'about.water_bill': { en: 'It is about your water bill.', context: 'Message type.' },
  'about.mobile_money': { en: 'It is about mobile money.', context: 'Message type: MoMo, Orange Money and similar.' },
  'about.telecom': { en: 'It is about your phone line or airtime.', context: 'Message type: phone company, credit, data.' },
  'about.bank': { en: 'It is about your bank account.', context: 'Message type.' },
  'about.health': { en: 'It is about your health or a hospital visit.', context: 'Message type.' },
  'about.school': { en: 'It is about school.', context: 'Message type: fees, meetings, results.' },
  'about.administrative': { en: 'It is about an official paper.', context: 'Message type: ID card, birth certificate, council.' },
  'about.legal': { en: 'It is about a legal matter, such as court or police.', context: 'Message type.' },
  'about.other': { en: 'We could not tell what this message is about.', context: 'Message type unknown.' },

  /* ---------- What to do ---------- */
  'action.pay': { en: 'You must pay.', context: 'Required action.' },
  'action.bring_document': { en: 'You must bring or send a paper.', context: 'Required action.' },
  'action.go_to_place': { en: 'You must go to an office or a place.', context: 'Required action.' },
  'action.call': { en: 'You must call them.', context: 'Required action.' },
  'action.reply': { en: 'You must answer this message.', context: 'Required action.' },
  'action.collect': { en: 'You can collect something.', context: 'Required action: pick up a document, parcel, result.' },
  'action.take_medicine': { en: 'Take your medicine as the paper says.', context: 'Required action.' },
  'action.nothing': { en: 'You do not need to do anything.', context: 'No action needed.' },
  'action.unclear': {
    en: 'We are not sure what you must do. Ask someone you trust.',
    context: 'The action could not be found.',
  },

  /* ---------- When ---------- */
  'deadline.by': { en: 'Do it by {date}.', context: 'Deadline.', slots: ['date'] },
  'deadline.on': { en: 'Be there on {date}.', context: 'An appointment, a convocation or a hearing: the day to go (not a deadline).', slots: ['date'] },
  'deadline.on_at': { en: 'Be there on {date} at {hour} {minutes} a.m.', context: 'Appointment day and time, morning ({hour} is 0-11).', slots: ['date', 'hour', 'minutes'] },
  'deadline.on_at_hour': { en: 'Be there on {date} at {hour} a.m.', context: 'Appointment day and time on the hour, morning ({hour} is 0-11).', slots: ['date', 'hour'] },
  'deadline.on_at_pm': { en: 'Be there on {date} at {hour} {minutes} p.m.', context: 'Appointment, afternoon: {hour} is on the 12-hour clock (1-5, or 12 for noon).', slots: ['date', 'hour', 'minutes'] },
  'deadline.on_at_hour_pm': { en: 'Be there on {date} at {hour} p.m.', context: 'Appointment on the hour, afternoon: {hour} is on the 12-hour clock (1-5, or 12 for noon).', slots: ['date', 'hour'] },
  'deadline.on_at_eve': { en: 'Be there on {date} at {hour} {minutes} p.m.', context: 'Appointment, evening: {hour} is on the 12-hour clock (6-11).', slots: ['date', 'hour', 'minutes'] },
  'deadline.on_at_hour_eve': { en: 'Be there on {date} at {hour} p.m.', context: 'Appointment on the hour, evening: {hour} is on the 12-hour clock (6-11).', slots: ['date', 'hour'] },
  'deadline.date': { en: 'It is on {date}.', context: 'The date of something that asks nothing of the person (a planned cut, a holiday).', slots: ['date'] },
  'deadline.from': { en: 'From {date}.', context: 'The day something starts or becomes available (not a deadline).', slots: ['date'] },
  'deadline.passed': { en: 'The date {date} has already passed.', context: 'The deadline is in the past.', slots: ['date'] },
  'deadline.none': { en: 'There is no date in this message.', context: 'No date found.' },

  /* ---------- Money ---------- */
  'money.amount': { en: 'The amount is {amount}.', context: 'An amount of money in the message.', slots: ['amount'] },
  'money.none': { en: 'This message does not say an amount of money.', context: 'No amount found.' },

  /* ---------- Help ---------- */
  'help.call': { en: 'To ask questions, call {phone}.', context: 'An official phone number to call.', slots: ['phone'] },
  'help.none': { en: 'If you are not sure, ask someone you trust.', context: 'No phone number found.' },

  /* ---------- Urgency ---------- */
  'urgency.info': { en: 'This is only information.', context: 'Green level.' },
  'urgency.soon': { en: 'Do this soon.', context: 'Amber level.' },
  'urgency.urgent': { en: 'This is urgent.', context: 'Red level.' },

  /* ---------- Facts-only fallback ---------- */
  'facts_only.intro': {
    en: 'We could not understand all of this message. Here is what we found.',
    context: 'Said when the app is not confident.',
  },

  /* ---------- Interface: buttons say their own name when touched ---------- */
  'ui.welcome': { en: 'Choose your language.', context: 'First screen.' },
  'ui.take_photo': { en: 'Take a photo of a message', context: 'Main button.' },
  'ui.paste': { en: 'Paste a message', context: 'Button: paste copied text.' },
  'ui.reading': { en: 'Reading your message.', context: 'Shown while the app works.' },
  'ui.camera_closer': { en: 'Move closer.', context: 'Camera guidance.' },
  'ui.camera_hold': { en: 'Hold still.', context: 'Camera guidance.' },
  'ui.camera_ok': { en: 'Got it.', context: 'Camera guidance: photo taken.' },
  'ui.retake': { en: 'The photo is not clear. Please take it again.', context: 'Photo unreadable.' },
  'ui.listen': { en: 'Listen', context: 'Button: play the card.' },
  'ui.again': { en: 'Again', context: 'Button: repeat this part.' },
  'ui.slower': { en: 'Slower', context: 'Button: speak more slowly.' },
  'ui.stop': { en: 'Stop', context: 'Button: stop speaking.' },
  'ui.call': { en: 'Call', context: 'Button: open the phone dialler.' },
  'ui.remind': { en: 'Remind me', context: 'Button: set a reminder for the deadline.' },
  'ui.show_helper': { en: 'Show someone', context: 'Button: show this card to a helper.' },
  'ui.show_source': { en: 'Where is this in the message?', context: 'Button: show the original text.' },
  'ui.history': { en: 'My messages', context: 'List of past cards.' },
  'ui.settings': { en: 'Settings', context: 'Settings screen.' },
  'ui.language': { en: 'Language', context: 'Setting.' },
  'ui.delete': { en: 'Delete', context: 'Button.' },
  'ui.back': { en: 'Back', context: 'Button.' },
  'ui.privacy': { en: 'Your messages never leave this phone.', context: 'Privacy promise.' },
  'ui.not_advice': {
    en: 'SabiTori explains messages. It does not give advice.',
    context: 'Shown on every card.',
  },
});

export type PhraseKey = keyof typeof CATALOG;
export const PHRASE_KEYS = Object.keys(CATALOG) as PhraseKey[];
