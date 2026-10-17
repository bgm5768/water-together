import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { ChevronsUpDown, Droplet, Pencil, Plus, X } from 'lucide-react';

interface Props {
  initialAmount: number;
  online: boolean;
  onClose: () => void;
  onSave: (amount: number, when: string, key: string) => Promise<void>;
}

export function DrinkSheet({ initialAmount, online, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(String(initialAmount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const request = useRef<{ amount: number; when: string; key: string } | null>(null);
  const amount = Number(value);
  const valid = value !== '' && Number.isInteger(amount) && amount >= 1 && amount <= 3000;
  const [capacity, setCapacity] = useState(Math.max(500, Math.ceil(initialAmount / 500) * 500));
  const level = Math.max(0, Math.min(100, (amount / capacity) * 100));
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
    setValue(String(Math.max(1, Math.min(capacity, Math.round(n)))));
    setError('');
  }
  function drag(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    change(((rect.bottom - event.clientY) / rect.height) * capacity);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 1;
    const next = {
      ArrowUp: amount + step,
      ArrowRight: amount + step,
      ArrowDown: amount - step,
      ArrowLeft: amount - step,
      PageUp: amount + 50,
      PageDown: amount - 50,
      Home: 1,
      End: capacity,
    }[event.key];
    if (next !== undefined && !saving) {
      event.preventDefault();
      change(next);
    }
  }
  async function save() {
    if (locked.current || !valid || !online) return;
    locked.current = true;
    setSaving(true);
    setError('');
    // Keep the same timestamp and idempotency key when retrying an uncertain response.
    if (!request.current || request.current.amount !== amount)
      request.current = { amount, when: new Date().toISOString(), key: crypto.randomUUID() };
    try {
      await onSave(request.current.amount, request.current.when, request.current.key);
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
      aria-labelledby="drink-title"
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
            <span>나를 위한 한 잔</span>
            <h2 id="drink-title">얼마나 마셨나요?</h2>
          </div>
          <button
            type="button"
            className="round-action"
            aria-label="물 마시기 닫기"
            autoFocus
            disabled={saving}
            onClick={onClose}
          >
            <X size={25} />
          </button>
        </header>
        <p id="drag-help" className="drink-tip">
          <ChevronsUpDown size={22} />
          <span>
            컵의 물을 <strong>위아래로 드래그</strong>해<br />
            마신 양에 맞춰 주세요.
          </span>
        </p>
        <div className="measure-area">
          <div className="measure-mug">
            <div className="mug-handle" aria-hidden="true" />
            <div
              className="mug-slider"
              role="slider"
              tabIndex={saving ? -1 : 0}
              aria-label="마신 물의 양"
              aria-orientation="vertical"
              aria-valuemin={1}
              aria-valuemax={capacity}
              aria-valuenow={valid ? amount : 1}
              aria-valuetext={`${valid ? amount : 0} ml`}
              aria-describedby="drag-help"
              aria-disabled={saving}
              onKeyDown={keyboard}
              onPointerDown={(event) => {
                if (saving || !event.isPrimary || event.button !== 0) return;
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag(event);
              }}
              onPointerMove={(event) => {
                if (!saving && event.currentTarget.hasPointerCapture(event.pointerId)) drag(event);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              <div className="mug-liquid" style={{ height: `${level}%` }} aria-hidden="true">
                <svg className="mug-surface" viewBox="0 0 600 48" preserveAspectRatio="none">
                  <path d="M0 24 Q150 0 300 24 T600 24 T900 24 T1200 24 V48 H0Z" />
                </svg>
              </div>
              <div className="mug-ticks" aria-hidden="true">
                {[0.25, 0.5, 0.75].map((f) => (
                  <i key={f} style={{ bottom: `${f * 100}%` }}>
                    <span>{Math.round(capacity * f)}</span>
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
          <span className="water-type">
            <Droplet size={17} fill="currentColor" /> 물
          </span>
        </div>
        <div className="drink-amount-field">
          <label htmlFor="drink-ml" className="sr-only">
            마신 양 직접 입력 (ml)
          </label>
          <div>
            <input
              id="drink-ml"
              type="number"
              inputMode="numeric"
              min="1"
              max="3000"
              step="1"
              required
              value={value}
              disabled={saving}
              onChange={(event) => {
                setValue(event.target.value);
                const entered = Number(event.target.value);
                if (entered > capacity && entered <= 3000)
                  setCapacity(Math.ceil(entered / 500) * 500);
                setError('');
              }}
            />
            <span>ml</span>
            <Pencil size={20} aria-hidden="true" />
          </div>
          <p>숫자를 눌러 정확한 양을 입력할 수도 있어요.</p>
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
          <Plus size={25} />
          {saving ? '기록하는 중…' : `${valid ? amount.toLocaleString('ko-KR') : '—'} ml 기록하기`}
        </button>
        <p className="drink-default-note">처음 표시되는 용량은 내 설정에서 바꿀 수 있어요.</p>
      </form>
    </dialog>
  );
}
