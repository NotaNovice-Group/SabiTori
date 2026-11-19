import { CircleCheck, FileText, Footprints, HandCoins, MessageSquareReply, OctagonX, PackageOpen, PhoneCall, Pill, type LucideIcon } from 'lucide-react';
import type { ActionKind } from '@sabitori/core';
import { daysLeft, moneyPieces } from '../lib/pictures';

const ACTION_PIC: Partial<Record<ActionKind, LucideIcon>> = {
  pay: HandCoins,
  bring_document: FileText,
  go_to_place: Footprints,
  call: PhoneCall,
  reply: MessageSquareReply,
  collect: PackageOpen,
  take_medicine: Pill,
  nothing: CircleCheck,
};

interface Props {
  scam: string;
  action: ActionKind;
  deadline?: string;
  /** "09:00" when the message gives a time. */
  time?: string;
  amount?: number;
  today: string;
  locale: string;
  numberLocale: string;
}

/**
 * The card as pictures, for people who cannot read the words and cannot hear them: what to do, by when, how much.
 * Decorative for screen readers (aria-hidden): the same facts are in the sections below and in the speech.
 * A scam card shows only the stop sign: never a picture of paying, never the money.
 */
export function PictureCard({ scam, action, deadline, time, amount, today, locale, numberLocale }: Props) {
  if (scam !== 'no_signs') {
    return (
      <div className="pics pics-scam" aria-hidden="true">
        <div className="pic pic-stop"><OctagonX strokeWidth={2.25} /></div>
      </div>
    );
  }
  const Act = ACTION_PIC[action];
  const days = deadline ? daysLeft(deadline, today) : undefined;
  const money = amount !== undefined && amount > 0 ? moneyPieces(amount) : undefined;
  if (!Act && days === undefined && !money) return null;
  const date = deadline ? new Date(`${deadline.slice(0, 10)}T12:00:00Z`) : undefined;
  const fmt = (n: number) => new Intl.NumberFormat(numberLocale).format(n);
  return (
    <div className="pics" aria-hidden="true">
      {Act && <div className="pic pic-act" data-action={action}><Act strokeWidth={2} /></div>}
      {date && days !== undefined && (
        <div className="pic pic-date" data-passed={days < 0 || undefined} data-today={days === 0 || undefined}>
          <span className="cal-month">{new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(date)}</span>
          <span className="cal-day num">{date.getUTCDate()}</span>
          {time && <span className="cal-time num">{time}</span>}
          {!time && days >= 0 && days <= 14 && (
            <span className="cal-dots">{Array.from({ length: Math.max(1, days) }, (_, i) => <i key={i} />)}</span>
          )}
        </div>
      )}
      {money && (
        <div className="pic pic-money">
          {money.pieces.map((p, i) => (
            <span key={i} className={p.coin ? 'coin num' : 'note num'}>{fmt(p.value)}</span>
          ))}
          {money.more > 0 && <span className="more num">+{money.more}</span>}
        </div>
      )}
    </div>
  );
}
