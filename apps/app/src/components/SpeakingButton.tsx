import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app-context';
import type { UiKey } from '../engine';

export const LONG_PRESS_MS = 550;
export const ARM_MS = 3000;

interface Props {
  /** Phrase spoken on long-press (and on the first tap in listen-first mode). */
  speakKey: UiKey;
  slots?: Record<string, string>;
  /** Visible label. Defaults to the spoken phrase. */
  label?: ReactNode;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'round' | 'seg' | 'hero';
  onAct: () => void;
  disabled?: boolean;
  className?: string;
  pressed?: boolean;
  /** Part of a radio group: exposes role=radio and aria-checked instead of aria-pressed. */
  radio?: boolean;
  /** Never arm (e.g. Stop must act at once). */
  immediate?: boolean;
  id?: string;
  type?: 'button' | 'submit';
}

/**
 * Every button says its own name. Long-press speaks it. In listen-first mode the
 * first tap speaks it and arms the button; a second tap within 3 s acts.
 */
export function SpeakingButton({ speakKey, slots, label, icon, variant = 'secondary', onAct, disabled, className, pressed, radio, immediate, id, type = 'button' }: Props) {
  const { t, say, settings } = useApp();
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const press = useRef<number | undefined>(undefined);
  const longDone = useRef(false);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(press.current);
    },
    [],
  );

  const start = () => {
    longDone.current = false;
    window.clearTimeout(press.current);
    press.current = window.setTimeout(() => {
      longDone.current = true;
      say(speakKey, slots);
    }, LONG_PRESS_MS);
  };
  const cancel = () => window.clearTimeout(press.current);

  const click = () => {
    if (longDone.current) {
      longDone.current = false;
      return;
    }
    if (settings.listenFirst && !immediate && !armed) {
      say(speakKey, slots);
      setArmed(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setArmed(false), ARM_MS);
      return;
    }
    window.clearTimeout(timer.current);
    setArmed(false);
    onAct();
  };

  return (
    <button
      id={id}
      type={type}
      className={`btn btn-${variant}${className ? ' ' + className : ''}`}
      data-armed={armed || undefined}
      role={radio ? 'radio' : undefined}
      aria-pressed={radio ? undefined : pressed}
      aria-checked={radio ? pressed : undefined}
      disabled={disabled}
      onClick={click}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {variant === 'round' ? <span className="round-ic">{icon}</span> : icon}
      <span className="btn-label">
        {label ?? t(speakKey, slots)}
        {armed && <small className="btn-armed">{t('app.tap_again')}</small>}
      </span>
    </button>
  );
}
