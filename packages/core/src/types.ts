/**
 * SabiTori core contract.
 *
 * Every package and app builds against these types. Two rules keep the
 * system open to Cameroon's 250+ languages:
 *
 * 1. Nothing language-specific lives in code. Words, numbers, dates and
 *    voices come from language packs (see ./pack.ts). Code only knows
 *    language-neutral keys and values.
 * 2. Nothing country-specific lives in code. Currency, phone formats and
 *    official senders come from a region config (see ./region.ts).
 */

/** BCP 47 language tag. ISO 639-1 where it exists (fr, en), else ISO 639-3 (wes, dua, ewo, fub). */
export type LangTag = string;

/** ISO 3166-1 alpha-2 region code, e.g. "CM". */
export type RegionCode = string;

/** Calendar date as YYYY-MM-DD. Never a JS Date: it must survive serialisation and time zones. */
export type IsoDate = string;

/** Half-open character range in MessageInput.text. */
export interface SourceSpan {
  start: number;
  end: number;
}

/** A value found by code in the message, with proof of where it came from. */
export interface Fact<T> {
  value: T;
  span: SourceSpan;
  /** The exact characters from the message, for the "show me where" view. */
  raw: string;
}

/** Money in minor-unit-free integer amounts. FCFA (XAF) has no minor unit. */
export interface Money {
  amount: number;
  /** ISO 4217 code from the region config. */
  currency: string;
}

/** Languages a message itself can be written in (what OCR and the model read). */
export type MessageLang = 'fr' | 'en' | 'unknown';

export interface MessageInput {
  text: string;
  source: 'photo' | 'share' | 'paste';
  /** What the person told us about the sender, or what a screenshot showed. */
  sender?: { kind: 'name' | 'number' | 'unknown'; value?: string };
  /** When the person received or captured it. Anchors relative dates ("demain"). */
  receivedAt: IsoDate;
  region: RegionCode;
}

/** Everything code (not AI) extracts. The AI never produces these. */
export interface Facts {
  lang: MessageLang;
  dates: Fact<IsoDate>[];
  amounts: Fact<Money>[];
  /** E.164, e.g. +237677123456. */
  phones: Fact<string>[];
  references: Fact<string>[];
  urls: Fact<string>[];
  /** Short codes such as *126# or #150#. */
  ussdCodes: Fact<string>[];
}

/* ------------------------------------------------------------------ */
/* Closed vocabularies. The model may only choose from these lists.    */
/* Adding a value means adding phrases for it to the catalog.          */
/* ------------------------------------------------------------------ */

export const MESSAGE_KINDS = [
  'electricity_bill',
  'water_bill',
  'mobile_money',
  'telecom',
  'bank',
  'health',
  'school',
  'administrative',
  'legal',
  'other',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const ACTION_KINDS = [
  'pay',
  'bring_document',
  'go_to_place',
  'call',
  'reply',
  'collect',
  'take_medicine',
  'nothing',
  'unclear',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const URGENCIES = ['info', 'soon', 'urgent'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const SCAM_SIGNALS = [
  'asks_pin',
  'wrong_transfer',
  'prize_fee',
  'account_block_threat',
  'link',
  'time_pressure',
  'sender_mismatch',
  'fake_balance',
  'asks_to_call_number',
  'ussd_instruction',
  'pay_to_personal_number',
] as const;
export type ScamSignal = (typeof SCAM_SIGNALS)[number];

/** Never "safe". The best SabiTori ever says is "no signs found". */
export type ScamLevel = 'likely_scam' | 'caution' | 'no_signs';

export interface ScamAssessment {
  level: ScamLevel;
  signals: ScamSignal[];
  /** Official sender this message claims to be, if any (id from region config). */
  claimedSenderId?: string;
}

/** What the model (or the rule-based fallback) decided. Labels only, no facts. */
export interface Understanding {
  kind: MessageKind;
  action: ActionKind;
  urgency: Urgency;
  /** 0..1. Below the card builder's threshold the card falls back to facts-only. */
  confidence: number;
  /** Optional one-line summary in the message's own language, for readers. Checked like facts. */
  summary?: string;
  /** Which classifier produced this, e.g. "rules@1" or "qwen2.5-1.5b-q4@1". */
  producedBy: string;
}

/** Pluggable understanding step. Implementations: rule-based (always available), on-device LLM. */
export interface Classifier {
  readonly id: string;
  classify(input: MessageInput, facts: Facts): Promise<Understanding>;
}

export interface Sender {
  /** Region config id, e.g. "mtn-momo". Present only when matched. */
  officialId?: string;
  displayName?: string;
  /** True only when the sender id/number matches the region's official list. */
  verified: boolean;
}

export interface Card {
  id: string;
  createdAt: string; // ISO timestamp
  input: MessageInput;
  facts: Facts;
  sender: Sender;
  understanding: Understanding;
  scam: ScamAssessment;
  /** The single facts chosen for the card. Each must exist in `facts`. */
  deadline?: Fact<IsoDate>;
  /** "HH:MM", when the message gives a time right after the deadline date ("le 20/11/2026 à 9h00"). Read from the text. */
  deadlineTime?: Fact<string>;
  /** The date is when something starts ("from Monday 23 November", "à partir du 23/11"), not a deadline. */
  deadlineFrom?: boolean;
  amount?: Fact<Money>;
  contactPhone?: Fact<string>;
  reference?: Fact<string>;
  /** What the rules alone read the message as, when another classifier answered. Safety text (balance check) keys on it. */
  rulesKind?: MessageKind;
  /** 'facts_only' when confidence is low or verification failed. */
  mode: 'full' | 'facts_only';
  /** Why the card is facts-only, for debugging and evaluation. */
  degradedReason?: 'low_confidence' | 'verification_failed' | 'unreadable';
}

/* ------------------------------------------------------------------ */
/* Speech plan: language-neutral description of what to say.           */
/* The speech package renders it with a language pack.                */
/* ------------------------------------------------------------------ */

export type SlotValue =
  | { type: 'number'; value: number }
  | { type: 'money'; value: Money }
  | { type: 'date'; value: IsoDate; relativeTo?: IsoDate }
  | { type: 'phone'; value: string }
  | { type: 'sender'; officialId?: string; fallbackText?: string }
  | { type: 'text'; value: string; lang: MessageLang };

/** One sentence to say: a catalog phrase key plus slot values. */
export interface Utterance {
  key: PhraseKey;
  slots?: Record<string, SlotValue>;
}

/** Card sections, in speaking order. The UI and the speech plan share these ids. */
export const CARD_SECTIONS = [
  'scam',
  'sender',
  'about',
  'action',
  'deadline',
  'money',
  'help',
  'urgency',
] as const;
export type CardSection = (typeof CARD_SECTIONS)[number];

export interface SpeechPlan {
  sections: { section: CardSection; utterances: Utterance[] }[];
}

/** Defined in ./catalog.ts; re-exported here so types.ts stays the single import. */
export type { PhraseKey } from './catalog.js';
import type { PhraseKey } from './catalog.js';
