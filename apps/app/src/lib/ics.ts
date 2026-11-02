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

function nextDay(d: IsoDate): IsoDate {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/** An all-day reminder on `date`, with an alert the evening before. */
export function buildIcs(args: { uid: string; date: IsoDate; title: string; description?: string; now?: Date }): string {
  const stamp = (args.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SabiTori//Reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${args.uid}@sabitori`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(args.date)}`,
    `DTEND;VALUE=DATE:${ymd(nextDay(args.date))}`,
    `SUMMARY:${esc(args.title)}`,
    ...(args.description ? [`DESCRIPTION:${esc(args.description)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(args.title)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
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
