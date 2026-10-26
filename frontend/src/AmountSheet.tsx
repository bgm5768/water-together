import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Droplet, Pencil, Plus, X } from 'lucide-react';
import { MugSlider } from './MugSlider';

interface Props {
  initialAmount: number;
  min: number;
  max: number;
  title: string;
  label: string;
  caption: string;
  footer: string;
  recording?: boolean;
  online?: boolean;
  onClose: () => void;
  onSave: (amount: number) => Promise<void> | void;
}

export function AmountSheet({
  initialAmount,
  min,
  max,
  title,
  label,
  caption,
  footer,
  recording = false,
  online = true,
  onClose,
  onSave,
}: Props) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(String(Math.max(min, Math.min(max, initialAmount))));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const amount = Number(value);
  const valid = value !== '' && Number.isInteger(amount) && amount >= min && amount <= max;
  useEffect(() => {
    const el = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    el.showModal();
    return () => {
      el.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  function change(n: number) {
    setValue(String(Math.max(min, Math.min(max, Math.round(n)))));
    setError('');
  }
  async function save() {
    if (locked.current || !valid || !online) return;
    locked.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(amount);
      onClose();
    } catch (e) {
      setError((e as Error).message || '저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="drink-sheet"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked.current) onClose();
      }}
    >
      <form
        className="drink-sheet-content"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <header className="drink-sheet-header">
          <div>
            <span>{caption}</span>
            <h2 id={`${id}-title`}>{title}</h2>
          </div>
          <button
            type="button"
            className="round-action"
            aria-label={`${recording ? '물 마시기' : label} 닫기`}
            autoFocus
            disabled={saving}
            onClick={onClose}
          >
            <X size={25} />
          </button>
        </header>
        <p id={`${id}-help`} className="drink-tip">
          <ChevronsUpDown size={22} />
          <span>
            컵의 물을 <strong>위아래로 드래그</strong>해<br />
            {recording ? '마신 양' : '원하는 양'}에 맞춰 주세요.
          </span>
        </p>
        <div className="measure-area">
          <MugSlider
            label={label}
            describedBy={`${id}-help`}
            value={valid ? amount : min}
            min={min}
            max={max}
            disabled={saving}
            onChange={change}
          />
          <span className="water-type">
            <Droplet size={17} fill="currentColor" /> 물
          </span>
        </div>
        <div className="drink-amount-field">
          <label htmlFor={`${id}-ml`} className="sr-only">
            {recording ? '마신 양' : label} 직접 입력 (ml)
          </label>
          <div>
            <input
              id={`${id}-ml`}
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step="1"
              required
              value={value}
              disabled={saving}
              onChange={(event) => {
                setValue(event.target.value);
                setError('');
              }}
            />
            <span>ml</span>
            <Pencil size={20} aria-hidden="true" />
          </div>
          <p>
            {min.toLocaleString('ko-KR')}–{max.toLocaleString('ko-KR')} ml · 숫자를 눌러 직접 입력할
            수 있어요.
          </p>
        </div>
        {error && (
          <p className="drink-save-error" role="alert">
            {error}
          </p>
        )}
        {!online && (
          <p className="drink-save-error" role="status">
            인터넷 연결 후 기록할 수 있어요.
          </p>
        )}
        <button className="drink-confirm" disabled={saving || !valid || !online}>
          {recording ? <Plus size={25} /> : <Check size={25} />}
          {saving
            ? recording
              ? '기록하는 중…'
              : '적용하는 중…'
            : `${valid ? amount.toLocaleString('ko-KR') : '—'} ml ${recording ? '기록하기' : '적용하기'}`}
        </button>
        <p className="drink-default-note">{footer}</p>
      </form>
    </dialog>
  );
}
