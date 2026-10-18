import { useEffect, useRef, useState } from 'react';

const KEY = 'water-reminder-sound';
export function useWaterSound() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KEY) !== 'off');
  const [hint, setHint] = useState('');
  const context = useRef<AudioContext | null>(null);
  async function unlock() {
    if (!('AudioContext' in window)) return;
    context.current ??= new AudioContext();
    if (context.current.state === 'suspended') await context.current.resume();
  }
  function play() {
    const audio = context.current;
    if (!audio || audio.state !== 'running') {
      setHint('물소리 미리 듣기를 눌러 이 화면의 소리를 켜주세요.');
      return;
    }
    // Soft, descending droplets synthesized locally; no third-party audio or network.
    for (let i = 0; i < 5; i++) {
      const at = audio.currentTime + i * 0.23;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1250 - i * 95, at);
      oscillator.frequency.exponentialRampToValueAtTime(320 + i * 25, at + 0.13);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.14, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.35);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
    setHint('앱이 열린 동안 알림이 오면 이 물소리가 나요.');
  }
  useEffect(() => {
    if (!enabled) return;
    const gesture = () => {
      void unlock().catch(() => {});
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'WATER_REMINDER' && document.visibilityState === 'visible') play();
    };
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    navigator.serviceWorker?.addEventListener('message', message);
    return () => {
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, [enabled]);
  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );
  return (
    <div className="water-sound">
      <label className="check-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            const checked = event.target.checked;
            setEnabled(checked);
            localStorage.setItem(KEY, checked ? 'on' : 'off');
          }}
        />
        <span>앱 안에서 물소리</span>
      </label>
      <button
        type="button"
        onClick={() =>
          void unlock()
            .then(play)
            .catch(() => setHint('이 브라우저에서 소리를 켜지 못했어요.'))
        }
      >
        물소리 미리 듣기
      </button>
      {hint && (
        <p className="field-hint" role="status">
          {hint}
        </p>
      )}
      <p className="field-hint">
        앱을 닫거나 화면을 잠그면 휴대폰의 알림음이 나요. 이때의 소리는 휴대폰 알림 설정에서 변경할
        수 있으며, 웹 앱에서 물소리로 지정할 수는 없어요.
      </p>
    </div>
  );
}
