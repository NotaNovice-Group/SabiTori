import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: 'primary' | 'quiet' | 'plain' | 'danger';
  children?: ReactNode;
};
export function Btn({ icon: Icon, variant = 'quiet', children, className = '', ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} className={`btn btn-${variant} ${className}`}>
      {Icon && <Icon size={22} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

export function Bar({ value, total, tone = 'info', label }: { value: number; total: number; tone?: 'info' | 'ink'; label: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`bar bar-${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SlotChip({ name, dashed }: { name: string; dashed?: boolean }) {
  return <span className={`chip ${dashed ? 'chip-dash' : ''}`}>{`{${name}}`}</span>;
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="12" width="4" height="8" rx="2" fill="currentColor" />
      <rect x="11" y="5" width="4" height="22" rx="2" fill="currentColor" />
      <rect x="18" y="9" width="4" height="14" rx="2" fill="currentColor" />
      <rect x="25" y="14" width="3" height="4" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function fmtMs(ms: number) {
  return ms ? `${(ms / 1000).toFixed(1)} s` : '';
}
