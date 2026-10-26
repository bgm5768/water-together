import { Pencil } from 'lucide-react';

interface Props {
  id: string;
  label: string;
  hint: string;
  value: number;
  disabled: boolean;
  onClick: () => void;
}

export function GoalAmount({ id, label, hint, value, disabled, onClick }: Props) {
  return (
    <div className="goal-amount">
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        className="goal-amount-button"
        aria-label={`${label} ${value.toLocaleString('ko-KR')} ml 변경`}
        aria-describedby={`${id}-hint`}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={onClick}
      >
        <strong>{value.toLocaleString('ko-KR')}</strong>
        <span>ml</span>
        <Pencil size={17} aria-hidden="true" />
      </button>
      <p id={`${id}-hint`} className="field-hint">
        {hint}
      </p>
    </div>
  );
}
