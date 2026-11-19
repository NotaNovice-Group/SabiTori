/** The SabiTori mark: a talking drum (the drum that carries messages by sound) and two sound arcs. Drawn in currentColor. */
export function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <ellipse cx="20" cy="14" rx="13" ry="4.5" />
      <path d="M7 14c0 8 8 8.5 8 12.5s-8 4.5-8 12.5" />
      <path d="M33 14c0 8-8 8.5-8 12.5s8 4.5 8 12.5" />
      <path d="M7 39a13 4.5 0 0 0 26 0" />
      <path d="M20 19v24.5" strokeWidth="2.2" />
      <path d="M38 9.5a5.5 5.5 0 0 1 4.5 4.5" />
      <path d="M39.5 3a11 11 0 0 1 6.5 10" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="brand">
      <Mark />
      <span className="wordmark">SabiTori</span>
    </span>
  );
}
