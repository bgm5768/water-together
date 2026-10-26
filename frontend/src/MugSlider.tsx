import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronsUpDown } from 'lucide-react';

interface Props {
  label: string;
  describedBy: string;
  value: number;
  min: number;
  max: number;
  dragStep?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function MugSlider({
  label,
  describedBy,
  value,
  min,
  max,
  dragStep = 1,
  disabled = false,
  onChange,
}: Props) {
  const pointer = useRef<number | null>(null);
  const amount = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
  const level = (amount / max) * 100;
  function change(next: number) {
    onChange(Math.max(min, Math.min(max, Math.round(next))));
  }
  function drag(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = ((rect.bottom - event.clientY) / rect.height) * max;
    change(Math.round(next / dragStep) * dragStep);
  }
  function release(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 1;
    const next = {
      ArrowUp: amount + step,
      ArrowRight: amount + step,
      ArrowDown: amount - step,
      ArrowLeft: amount - step,
      PageUp: amount + Math.max(50, dragStep),
      PageDown: amount - Math.max(50, dragStep),
      Home: min,
      End: max,
    }[event.key];
    if (next !== undefined && !disabled) {
      event.preventDefault();
      change(next);
    }
  }
  return (
    <div className="measure-mug">
      <div className="mug-handle" aria-hidden="true" />
      <div
        className="mug-slider"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={amount}
        aria-valuetext={`${amount.toLocaleString('ko-KR')} ml`}
        aria-describedby={describedBy}
        aria-disabled={disabled}
        onKeyDown={keyboard}
        onPointerDown={(event) => {
          if (disabled || !event.isPrimary || event.button !== 0) return;
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = event.pointerId;
          drag(event);
        }}
        onPointerMove={(event) => {
          if (!disabled && pointer.current === event.pointerId) drag(event);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={() => {
          pointer.current = null;
        }}
      >
        <div className="mug-liquid" style={{ height: `${level}%` }} aria-hidden="true">
          <svg className="mug-surface" viewBox="0 0 600 48" preserveAspectRatio="none">
            <path d="M0 24 Q150 0 300 24 T600 24 T900 24 T1200 24 V48 H0Z" />
          </svg>
        </div>
        <div className="mug-ticks" aria-hidden="true">
          {[0.25, 0.5, 0.75].map((fraction) => (
            <i key={fraction} style={{ bottom: `${fraction * 100}%` }}>
              <span>{Math.round(max * fraction).toLocaleString('ko-KR')}</span>
            </i>
          ))}
        </div>
        <span
          className="mug-drag-grip"
          style={{ bottom: `clamp(25px, ${level}%, calc(100% - 25px))` }}
          aria-hidden="true"
        >
          <ChevronsUpDown size={28} />
        </span>
      </div>
    </div>
  );
}
