/** The SabiTori mark: a sheet of paper with a folded corner, and two sound arcs. Drawn in currentColor. */
export function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 5h17l9 9v29H8z" />
      <path d="M25 5v9h9" />
      <path d="M14 25h14M14 32h9" />
      <path d="M39 22.5a7 7 0 0 1 0 9" />
      <path d="M43.5 17.5a13.5 13.5 0 0 1 0 19" />
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
