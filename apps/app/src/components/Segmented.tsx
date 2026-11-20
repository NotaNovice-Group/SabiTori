import type React from 'react';
import { Check } from 'lucide-react';
import { SpeakingButton } from './SpeakingButton';
import type { UiKey } from '../engine';

export interface SegOption<T extends string | number> {
  value: T;
  key: UiKey;
  label: string;
  /** A picture for the choice, so it can be found without reading; kept beside the check when chosen. */
  icon?: React.ReactNode;
}

/** A radio group of big pills. The chosen one is filled and carries a check, never colour alone. */
export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: SegOption<T>[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" data-n={options.length} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <SpeakingButton
          key={String(o.value)}
          speakKey={o.key}
          variant="seg"
          radio
          pressed={o.value === value}
          icon={
            o.value === value ? (
              <>
                <Check size={24} strokeWidth={2.5} aria-hidden />
                {o.icon}
              </>
            ) : (
              o.icon
            )
          }
          label={o.label}
          onAct={() => onChange(o.value)}
        />
      ))}
    </div>
  );
}
