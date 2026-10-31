/**
 * Prompt data for the on-device classifier. Pure data + two tiny builders.
 * Tune or translate the wording here without touching classifier logic.
 *
 * The model is only asked to pick labels. Label names are the closed lists
 * from @sabitori/core; the descriptions below help a 1.5B model choose.
 */
import { ACTION_KINDS, MESSAGE_KINDS, URGENCIES } from '@sabitori/core';
import type { MessageInput } from '@sabitori/core';

export const SYSTEM_PROMPT = [
  'You classify one SMS or official message from Cameroon (French or English).',
  'Answer with ONE JSON object: {"kind":..., "action":..., "urgency":..., "confidence":...}.',
  `kind is one of: ${MESSAGE_KINDS.join(', ')}.`,
  `action is what the reader must do: ${ACTION_KINDS.join(', ')}.`,
  `urgency is one of: ${URGENCIES.join(', ')} (urgent = deadline within days or a cut-off threat).`,
  'confidence is a number from 0 to 1. Use a low number when unsure.',
  'Never invent dates, amounts or phone numbers. Output only the JSON.',
].join('\n');

export interface FewShot {
  text: string;
  sender?: string;
  answer: { kind: string; action: string; urgency: string; confidence: number };
}

export const FEW_SHOTS: readonly FewShot[] = [
  {
    text: 'ENEO: Votre facture d\'electricite de 18 500 FCFA est disponible. Payez avant le 05/11 pour eviter la coupure.',
    sender: 'ENEO',
    answer: { kind: 'electricity_bill', action: 'pay', urgency: 'urgent', confidence: 0.9 },
  },
  {
    text: 'Vous avez recu 10000 FCFA de NGONO MARIE. Ref: MP240815. Nouveau solde: 12500 FCFA.',
    sender: 'MobileMoney',
    answer: { kind: 'mobile_money', action: 'nothing', urgency: 'info', confidence: 0.9 },
  },
  {
    text: 'Hospital Laquintinie: your appointment is on Monday 9am. Please bring your carnet de sante and previous results.',
    answer: { kind: 'health', action: 'bring_document', urgency: 'soon', confidence: 0.85 },
  },
  {
    text: 'Lycee de Bonamoussadi: les parents sont invites a venir payer la 2e tranche des frais de scolarite avant vendredi.',
    answer: { kind: 'school', action: 'pay', urgency: 'soon', confidence: 0.85 },
  },
  {
    text: 'Your national ID card is ready. Collect it at the Divisional Office, Douala 3e, Monday to Friday 8am-3pm.',
    answer: { kind: 'administrative', action: 'collect', urgency: 'soon', confidence: 0.85 },
  },
  {
    text: 'Salut, ca va ?',
    answer: { kind: 'other', action: 'unclear', urgency: 'info', confidence: 0.3 },
  },
];

/** Keep the start (sender, topic) and the end (deadline, instructions) of long text. */
export const MAX_INPUT_CHARS = 1200;
export const KEEP_HEAD = 800;
export const ELLIPSIS = ' [...] ';

export function truncateText(text: string, max = MAX_INPUT_CHARS): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const head = Math.min(KEEP_HEAD, max - ELLIPSIS.length - 1);
  const tail = max - head - ELLIPSIS.length;
  return t.slice(0, head) + ELLIPSIS + t.slice(t.length - tail);
}

export function formatUser(text: string, sender?: string): string {
  return (sender ? `Sender: ${sender}\n` : '') + `Message: ${truncateText(text)}`;
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildMessages(input: MessageInput): PromptMessage[] {
  const msgs: PromptMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const s of FEW_SHOTS) {
    msgs.push({ role: 'user', content: formatUser(s.text, s.sender) });
    msgs.push({ role: 'assistant', content: JSON.stringify(s.answer) });
  }
  const sender = input.sender?.kind !== 'unknown' ? input.sender?.value : undefined;
  msgs.push({ role: 'user', content: formatUser(input.text, sender) });
  return msgs;
}

const alt = (xs: readonly string[]) => '(' + xs.map((x) => `"${x}"`).join(' | ') + ')';

/** GBNF grammar: the output can only be a JSON object with valid labels. */
export function buildGrammar(): string {
  return [
    `root ::= "{\\"kind\\":\\"" kind "\\",\\"action\\":\\"" action "\\",\\"urgency\\":\\"" urgency "\\",\\"confidence\\":" conf "}"`,
    `kind ::= ${alt(MESSAGE_KINDS)}`,
    `action ::= ${alt(ACTION_KINDS)}`,
    `urgency ::= ${alt(URGENCIES)}`,
    `conf ::= "0." [0-9] [0-9]? | "1.0" | "1" | "0"`,
  ].join('\n');
}
