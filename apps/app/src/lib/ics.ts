import type { IsoDate } from '@sabitori/core';

/** RFC 5545 3.3.11 TEXT: backslash, semicolon and comma are escaped with a backslash; a newline is "\n". */
export function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** RFC 5545 says lines over 75 octets are folded with CRLF + space. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (enc.encode(cur + ch).length > limit) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function ymd(d: IsoDate): string {
  return d.replace(/-/g, '');
}

const timed = (time?: string) => !!time && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

function when(date: IsoDate, time?: string): string[] {
  if (!timed(time)) return [`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(date))}`];
  const [h, m] = time!.split(':').map(Number) as [number, number];
  const end = h === 23 ? { d: nextDay(date), h: 0 } : { d: date, h: h + 1 };
  const hm = (hh: number) => `${String(hh).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
  return [`DTSTART:${ymd(date)}T${hm(h)}`, `DTEND:${ymd(end.d)}T${hm(end.h)}`];
}

function nextDay(d: IsoDate): IsoDate {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/**
 * A reminder on `date`: all day with an alert the day before, or, with a `time` ("HH:MM", an appointment), a one-hour
 * event at that local time with alerts the day before and two hours before. Local "floating" time: the phone's own.
 */
export function buildIcs(args: { uid: string; date: IsoDate; time?: string; title: string; description?: string; now?: Date }): string {
  const stamp = (args.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SabiTori//Reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${args.uid}@sabitori`,
    `DTSTAMP:${stamp}`,
    ...when(args.date, args.time),
    `SUMMARY:${esc(args.title)}`,
    ...(args.description ? [`DESCRIPTION:${esc(args.description)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(args.title)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    ...(timed(args.time) ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(args.title)}`, 'TRIGGER:-PT2H', 'END:VALARM'] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
