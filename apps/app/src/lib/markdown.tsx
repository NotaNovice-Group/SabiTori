import type { ReactNode } from 'react';

/**
 * A very small Markdown reader for the notices shipped with the app (THIRD_PARTY_NOTICES.md, VOICE.md):
 * headings, paragraphs, lists and tables, with `code`, **bold** and [links](url). No HTML is ever
 * injected. Links are shown as text, not followed: the app works offline, and a tap must never take the
 * person out of it. A table becomes one block per row ("Header: value" lines), which reads well on a
 * narrow phone at a large text size and with a screen reader.
 */
export type MdBlock =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ kind: 'h', level: h[1]!.length, text: h[2]!.trim() });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flush();
      const block: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) block.push(lines[i++]!);
      i--;
      const rows = block.filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l)).map(cells);
      const [head = [], ...body] = rows;
      out.push({ kind: 'table', head, rows: body });
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line) ?? /^\s*\d+\.\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const items = [li[1]!];
      while (i + 1 < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i + 1]!) || /^\s{2,}\S/.test(lines[i + 1]!))) {
        const next = lines[++i]!;
        const m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(next);
        if (m) items.push(m[1]!);
        else items[items.length - 1] += ' ' + next.trim();
      }
      out.push({ kind: 'ul', items });
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return out;
}

/** Inline: `code`, **bold**, [text](url) -> "text (url)". */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let k = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<code key={k++}>{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<b key={k++}>{m[2]}</b>);
    else out.push(m[3] === m[4] ? m[3] : `${m[3]} (${m[4]})`);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ src, baseLevel = 2 }: { src: string; baseLevel?: number }) {
  const blocks = parseMarkdown(src);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.kind === 'h') {
          const level = Math.min(6, Math.max(baseLevel, baseLevel + b.level - 1));
          const H = `h${level}` as 'h2';
          return <H key={i} className="md-h">{inline(b.text)}</H>;
        }
        if (b.kind === 'p') return <p key={i}>{inline(b.text)}</p>;
        if (b.kind === 'ul') return <ul key={i} className="md-ul">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>;
        return (
          <ul key={i} className="md-table">
            {b.rows.map((r, j) => (
              <li key={j}>
                <p className="md-row-head">{inline(r[0] ?? '')}</p>
                {r.slice(1).map((c, n) => c && (
                  <p key={n}><span className="md-k">{inline(b.head[n + 1] ?? '')}{b.head[n + 1] ? ': ' : ''}</span>{inline(c)}</p>
                ))}
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

/** The credit lines of a voice card (packs/<tag>/voice/VOICE.md): its title, licence and attribution. */
export function voiceCredit(md: string): { title: string; licence?: string; attribution?: string } | null {
  const blocks = parseMarkdown(md);
  const title = blocks.find((b): b is Extract<MdBlock, { kind: 'h' }> => b.kind === 'h')?.text;
  if (!title) return null;
  const rows = blocks.filter((b): b is Extract<MdBlock, { kind: 'table' }> => b.kind === 'table').flatMap((t) => [t.head, ...t.rows]);
  const get = (k: RegExp) => rows.find((r) => k.test(r[0] ?? ''))?.[1];
  // The cards quote the credit line and add notes for maintainers after it; keep the quoted credit only.
  const attr = get(/^attribution$/i);
  const quoted = attr && /^"([^"]+)"/.exec(attr)?.[1];
  const licence = get(/^licen[cs]e$/i)?.replace(/\s*\((?:from|see)\b[^)]*\)\s*$/i, '').replace(/\*\*/g, '');
  return { title, licence, attribution: quoted ?? attr };
}
