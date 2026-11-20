/**
 * Region configuration. Everything country-specific lives in
 * /regions/<CODE>/region.json, never in code.
 */
import type { LangTag, MessageKind, RegionCode } from './types.js';

export interface OfficialSender {
  /** Stable id, e.g. "mtn-momo". */
  id: string;
  displayName: string;
  /** Other names the message text may use ("MTN MoMo", "Mobile Money"). Lower-cased matching. */
  aliases: string[];
  kind: MessageKind;
  /** Alphanumeric SMS sender ids the company really uses. */
  smsSenderIds: string[];
  /** Short numbers it sends from or answers on. */
  shortCodes: string[];
  /** Official customer line, spoken in "help" when a scam is suspected. */
  helpline?: string;
  /** Official USSD code to check a balance, e.g. for mobile money. */
  balanceCode?: string;
  /**
   * The company's own web domains ("mtn.cm"). A link to one of them, or to a subdomain, is its website, printed on
   * every bill, letter and business card: not a scam sign. A look-alike ("mtn-cm.xyz", "mtn.cm.bonus.top") still is.
   */
  domains?: string[];
  /**
   * False until a maintainer has confirmed smsSenderIds/shortCodes/helpline
   * from an official source. Unverified entries are never used to call a
   * message genuine; they are only used to detect a *claimed* sender.
   */
  verified: boolean;
  source?: string;
}

export interface RegionConfig {
  formatVersion: 1;
  code: RegionCode;
  name: string;
  timezone: string; // IANA
  currency: { code: string; aliases: string[] };
  phone: {
    countryCode: string; // "237"
    /** Regex source for a national significant number, without country code. */
    nationalPattern: string;
    /** National-number prefixes of personal mobile lines, e.g. ["6"] in Cameroon. */
    mobilePrefixes?: string[];
  };
  /** Languages offered in this region, in display order. */
  languages: LangTag[];
  officialSenders: OfficialSender[];
}
