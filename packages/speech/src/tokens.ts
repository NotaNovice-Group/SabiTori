/**
 * A token is the smallest unit the rules produce. `id` is the deterministic
 * clip id (null when nothing is recorded, e.g. a hyphen). `text` is what TTS
 * speaks and what is displayed.
 */
export interface Token {
  id: string | null;
  text: string;
  /** "both": no space either side (hyphen). "left": no space before (comma). */
  glue?: 'both' | 'left';
  /** Skipped silently in recorded packs when the clip is missing (pauses). */
  optional?: boolean;
}

export function assemble(tokens: Token[]): string {
  let out = '';
  let prevGlueBoth = false;
  for (const t of tokens) {
    if (t.text === '') continue;
    if (out === '') out = t.text;
    else if (t.glue === 'both' || t.glue === 'left' || prevGlueBoth) out += t.text;
    else out += ' ' + t.text;
    prevGlueBoth = t.glue === 'both';
  }
  return out;
}

export type TemplatePart = { kind: 'slot'; name: string } | { kind: 'word'; key: string };

/** Parse "{day} {month} {w:of}" into parts. Literal text is not allowed: every spoken word needs a clip id. */
export function parseTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  for (const raw of template.split(/\s+/).filter(Boolean)) {
    const m = /^\{(w:)?([A-Za-z0-9_.-]+)\}$/.exec(raw);
    if (!m) throw new Error(`template part "${raw}" must be {name} or {w:word}; literal text is not allowed`);
    parts.push(m[1] ? { kind: 'word', key: m[2]! } : { kind: 'slot', name: m[2]! });
  }
  return parts;
}
