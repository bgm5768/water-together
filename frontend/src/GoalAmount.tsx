import { Minus, Plus } from 'lucide-react';
import { MugSlider } from './MugSlider';

interface Props {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

export function GoalAmount({ id, label, hint, value, min, max, step, disabled, onChange }: Props) {
  return (
    <section className="goal-amount" aria-labelledby={`${id}-label`}>
      <h3 id={`${id}-label`}>{label}</h3>
      <p id={`${id}-hint`} className="goal-amount-hint">
        {hint}
      </p>
      <div className="goal-amount-control">
        <MugSlider
          label={label}
          describedBy={`${id}-hint goal-drag-help`}
          value={value}
          min={min}
          max={max}
          dragStep={step}
          disabled={disabled}
          onChange={onChange}
        />
        <div className="goal-amount-summary">
          <output className="goal-amount-value" aria-label={`${label} 선택값`}>
            <strong>{value.toLocaleString('ko-KR')}</strong> <span>ml</span>
          </output>
          <div className="goal-amount-adjust">
            <button
              type="button"
              aria-label={`${label} ${step} ml 줄이기`}
              disabled={disabled || value <= min}
              onClick={() => onChange(Math.max(min, value - step))}
            >
              <Minus size={18} />
            </button>
            <span>{step} ml씩</span>
            <button
              type="button"
              aria-label={`${label} ${step} ml 늘리기`}
              disabled={disabled || value >= max}
              onClick={() => onChange(Math.min(max, value + step))}
            >
              <Plus size={18} />
            </button>
          </div>
          <small className="goal-amount-range">
            {min.toLocaleString('ko-KR')}–{max.toLocaleString('ko-KR')} ml
          </small>
        </div>
      </div>
    </section>
  );
}
