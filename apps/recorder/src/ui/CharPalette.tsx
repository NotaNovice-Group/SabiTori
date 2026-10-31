import { useState, type RefObject } from 'react';
import { Pencil, ArrowBigUp } from 'lucide-react';
import { DEFAULT_PALETTE, MARK_NAMES, isMark } from '../lib/model';

/** Insert text at the caret of an input or textarea and let React see the change. */
export function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement, s: string) {
  el.focus();
  const a = el.selectionStart ?? el.value.length;
  const b = el.selectionEnd ?? a;
  el.setRangeText(s, a, b, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

interface Props {
  palette: string[];
  onChange: (p: string[]) => void;
  target: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

export function CharPalette({ palette, onChange, target }: Props) {
  const [caps, setCaps] = useState(false);
  const [editing, setEditing] = useState(false);
  const letters = palette.filter((c) => !isMark(c));
  const marks = palette.filter(isMark);
  const shown = (c: string) => (caps ? c.toUpperCase() : c);
  const put = (c: string) => target.current && insertAtCaret(target.current, c);
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the caret in the text field

  return (
    <div className="palette" role="group" aria-label="Letters for this language">
      <div className="palette-row">
        {letters.map((c) => (
          <button key={c} type="button" className="key" onMouseDown={keep} onClick={() => put(shown(c))} aria-label={`Letter ${shown(c)}`}>
            {shown(c)}
          </button>
        ))}
        {marks.length > 0 && <span className="palette-gap" aria-hidden />}
        {marks.map((c) => (
          <button key={c} type="button" className="key key-mark" onMouseDown={keep} onClick={() => put(c)} aria-label={`Tone mark ${MARK_NAMES[c] ?? 'mark'}`} title={MARK_NAMES[c]}>
            {'◌' + c}
          </button>
        ))}
        <button type="button" className={`key key-tool ${caps ? 'on' : ''}`} onMouseDown={keep} onClick={() => setCaps(!caps)} aria-pressed={caps}>
          <ArrowBigUp size={20} aria-hidden /> <span>Capitals</span>
        </button>
        <button type="button" className="key key-tool" onClick={() => setEditing(!editing)} aria-expanded={editing}>
          <Pencil size={18} aria-hidden /> <span>Edit letters</span>
        </button>
      </div>
      {editing && (
        <div className="palette-edit">
          <label htmlFor="palette-input">Letters and tone marks for this language, separated by spaces</label>
          <input
            id="palette-input"
            lang="und"
            defaultValue={palette.map((c) => (isMark(c) ? '◌' + c : c)).join(' ')}
            onChange={(e) => {
              const chars = [
                ...new Set(
                  e.target.value
                    .normalize('NFC')
                    .split(/\s+/)
                    .map((t) => t.replace(/\u25CC/g, ''))
                    .flatMap((t) => (/^\p{M}+$/u.test(t) ? [...t] : [t]))
                    .filter(Boolean),
                ),
              ];
              onChange(chars);
            }}
          />
          <button type="button" className="btn btn-plain" onClick={() => onChange([...DEFAULT_PALETTE])}>
            Reset to the standard set
          </button>
        </div>
      )}
    </div>
  );
}
