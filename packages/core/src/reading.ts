/**
 * Reading lexicon: every word the pipeline needs to READ a message in one
 * language. Lives in packs/<tag>/reading.json. Code never contains these words.
 *
 * Matching rules (shared by every list below):
 * - Matching ignores case and accents ("Réglez" == "reglez"), and curly
 *   apostrophes equal straight ones.
 * - A term matches whole words only. A trailing `*` makes it a prefix
 *   ("regl*" matches "régler", "règlement").
 * - `{n}` inside a term stands for a run of digits ("dans les {n} minutes").
 * - Spaces inside a term match any run of white space.
 */
import type { ActionKind, LangTag, MessageKind } from './types.js';

export interface ReadingLexicon {
  formatVersion: 1;
  /** Language tag, same as the folder: "fr", "en". */
  tag: LangTag;
  /** English name, for maintainers. */
  name: string;
  /** Very common function words, used to detect the language of a message. */
  stopwords: string[];

  /** 12 lists (January first). Each list holds the full name and abbreviations, without the final dot. */
  months: string[][];
  /** 7 lists (Sunday first). Full names. */
  weekdays: string[][];
  /** Word -> day offset from the date the message was received ("demain": 1). */
  relativeDays: Record<string, number>;
  /** Written after a day number: "12th", "1er". */
  ordinalSuffixes: string[];
  /** Words allowed between day and month: "12th of November". */
  dateFillers: string[];
  /** Words that may directly precede a day/month written without a year ("avant le 15/11"). */
  dateLeadWords: string[];
  /** Words that may directly precede a weekday name used as a date ("avant vendredi"). */
  weekdayLeadWords: string[];

  /** Spelled-out currency words ("francs cfa"), added to the region's currency aliases. */
  currencyWords: string[];
  /** Words that label the amount to pay ("montant", "total"). */
  amountWords: string[];
  /** Words that label a balance (never the amount to pay). */
  balanceWords: string[];
  /** Words before an amount that is a penalty or late fee, never the amount to pay ("pénalité", "majoration", "late fee"). */
  penaltyWords?: string[];
  /** Words that give the NEW date of something moved ("reporté au", "moved to"); that date replaces the old one. */
  rescheduleWords?: string[];
  /** Words before a yearly total ("total annuel", "annual total"): not what is due now, unless it is the deadline's amount. */
  annualTotalWords?: string[];
  /** Labels before a reference number ("n° facture", "ref"). */
  referenceLabels: string[];
  /** Words that introduce a deadline ("avant le", "délai"). */
  deadlineWords: string[];
  /** Words that introduce a phone number to call ("appelez"). */
  contactWords: string[];
  /** Words that introduce a short number such as 8080 ("appelez le", "call"). */
  shortCodeLabels: string[];

  /** Keyword lists per message kind. Each distinct term found scores one point. */
  kinds: Partial<Record<MessageKind, string[]>>;
  /** Keyword lists per action. */
  actions: Partial<Record<ActionKind, string[]>>;
  urgency: { urgent: string[]; soon: string[] };
  /** Operator promotions ("doublez votre recharge", "special offer"): read as "nothing to do", never urgent. */
  promoWords?: string[];

  scam: {
    /** "code secret", "pin": things a scammer wants. */
    secretWords: string[];
    /** Verbs of asking for / giving them ("envoyez", "send"). */
    askVerbs: string[];
    /** Words that turn a sentence into a warning ("jamais", "never"). Cancel asks_pin in that sentence. */
    negations: string[];
    /** "par erreur", "by mistake". */
    mistakeWords: string[];
    /** "renvoyer", "send back". */
    returnWords: string[];
    prizeWords: string[];
    feeWords: string[];
    blockThreats: string[];
    timePressure: string[];
    /** "Vous avez reçu", "Transfert de". */
    moneyReceived: string[];
    /** "appelez", "call". */
    callWords: string[];
    /** Words meaning "using": a company named right after them is a payment channel, not the sender. */
    viaWords: string[];
    /** Words that end a clause for negation scope ("mais", "but"). Commas and semicolons always do. */
    clauseBreaks?: string[];
    /** Words joining a list of companies ("ou", "or"): a company after another one is a channel. */
    joinWords?: string[];
    /** Verbs of paying / sending / transferring money ("payez", "send"). */
    payVerbs?: string[];
    /** Verbs of dialling a USSD code ("composez", "dial"). */
    dialWords?: string[];
    /** "j'ai changé de numéro", "changed my number": the opening of a family-impersonation scam. */
    numberChangeWords?: string[];
    /** "accident", "hospital emergency": the story used to rush someone into calling or paying a stranger. */
    emergencyWords?: string[];
    /** Purposes a scam gives for dialling: receive, unlock, confirm, verify money or account. */
    ussdPurposeWords?: string[];
  };
}
