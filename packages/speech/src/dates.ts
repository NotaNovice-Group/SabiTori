import type { IsoDate, PackRules } from '@sabitori/core';
import { SpeechRuleError } from './errors.js';
import { numberTokens } from './numbers.js';
import { parseTemplate, type Token } from './tokens.js';
import { wordToken } from './words.js';

export function parseIso(d: IsoDate): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new SpeechRuleError(`bad date "${d}", expected YYYY-MM-DD`);
  const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, da));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== da) {
    throw new SpeechRuleError(`bad date "${d}"`);
  }
  return { y, m: mo, d: da };
}

function dayNumber(d: IsoDate): number {
  const p = parseIso(d);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
}

/** ISO weekday: Monday 1 .. Sunday 7. */
export function isoWeekday(d: IsoDate): number {
  const n = dayNumber(d); // 1970-01-01 was a Thursday (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

const Y = { context: 'year', overflow: 'throw' } as const;

export function dateTokens(rules: PackRules, date: IsoDate, anchor: IsoDate): Token[] {
  const dr = rules.dates;
  if (!dr) throw new SpeechRuleError('rules.dates is missing');
  const p = parseIso(date);
  const a = parseIso(anchor);

  const diff = dayNumber(date) - dayNumber(anchor);
  const relKey = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff === -1 ? 'yesterday' : undefined;
  if (relKey && dr.relative?.[relKey] !== undefined) {
    return [{ id: `rel.${relKey}`, text: dr.relative[relKey]! }];
  }

  const omitYear = (dr.omitCurrentYear ?? true) && p.y === a.y;
  const wd = dr.includeWeekday && dr.weekdays;
  const t = dr.templates;
  const template = (wd ? (omitYear ? t.noYearWeekday : t.fullWeekday) : undefined) ?? (omitYear ? t.noYear : t.full);

  const out: Token[] = [];
  for (const part of parseTemplate(template)) {
    if (part.kind === 'word') {
      out.push(wordToken(rules, part.key));
      continue;
    }
    switch (part.name) {
      case 'day': {
        const w = dr.days && Object.prototype.hasOwnProperty.call(dr.days, String(p.d)) ? dr.days[String(p.d)] : undefined;
        if (typeof w === 'string') out.push({ id: `day.${p.d}`, text: w });
        else out.push(...numberTokens(rules.numbers, p.d, { context: 'day', overflow: 'throw' }));
        break;
      }
      case 'month': {
        const name = dr.months[p.m - 1];
        if (typeof name !== 'string') throw new SpeechRuleError(`rules.dates.months has no month ${p.m}`);
        out.push({ id: `month.${p.m}`, text: name });
        break;
      }
      case 'weekday': {
        const w = isoWeekday(date);
        const name = dr.weekdays?.[w - 1];
        if (typeof name !== 'string') throw new SpeechRuleError('rules.dates.weekdays is missing');
        out.push({ id: `weekday.${w}`, text: name });
        break;
      }
      case 'year': {
        const lo = p.y % 100;
        if (dr.yearStyle === 'century_pairs' && p.y >= 1100 && !(p.y >= 2000 && p.y <= 2009) && lo !== 0) {
          out.push(...numberTokens(rules.numbers, Math.floor(p.y / 100), Y), ...numberTokens(rules.numbers, lo, Y));
        } else out.push(...numberTokens(rules.numbers, p.y, Y));
        break;
      }
      default:
        throw new SpeechRuleError(`unknown date template slot {${part.name}}`);
    }
  }
  return out;
}
