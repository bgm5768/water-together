import { useEffect, useRef, useState } from 'react';

const KEY = 'water-reminder-sound';
const SOUND_URL = `${import.meta.env.BASE_URL}audio/can-pop.mp3`;
export function useWaterSound() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KEY) !== 'off');
  const [hint, setHint] = useState('');
  const context = useRef<AudioContext | null>(null);
  const buffer = useRef<Promise<AudioBuffer> | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const playback = useRef(0);
  function loadSound(audio: AudioContext) {
    buffer.current ??= fetch(SOUND_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Sound unavailable');
        return response.arrayBuffer();
      })
      .then((bytes) => audio.decodeAudioData(bytes))
      .catch((error: unknown) => {
        buffer.current = null;
        throw error;
      });
    return buffer.current;
  }
  async function unlock() {
    if (!('AudioContext' in window)) throw new Error('Audio unavailable');
    context.current ??= new AudioContext();
    if (context.current.state === 'suspended') await context.current.resume();
    await loadSound(context.current);
  }
  async function play() {
    const request = ++playback.current;
    const audio = context.current;
    if (!audio || audio.state !== 'running') {
      setHint('탄산 소리 미리 듣기를 눌러 이 화면의 소리를 켜주세요.');
      return;
    }
    const decoded = await loadSound(audio);
    if (request !== playback.current || audio.state !== 'running') return;
    source.current?.stop();
    const next = audio.createBufferSource();
    next.buffer = decoded;
    next.connect(audio.destination);
    source.current = next;
    next.onended = () => {
      next.disconnect();
      if (source.current === next) source.current = null;
    };
    next.start();
    setHint('톡! 시원하게 캔을 따는 소리예요. 앱이 열린 동안 알림에 사용해요.');
  }
  useEffect(() => {
    if (!enabled) return;
    const gesture = () => {
      void unlock().catch(() => {});
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'WATER_REMINDER' && document.visibilityState === 'visible')
        void play().catch(() => setHint('소리를 불러오지 못했어요. 미리 듣기로 다시 시도해주세요.'));
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
      playback.current++;
      source.current?.stop();
      source.current = null;
      void context.current?.close();
      context.current = null;
      buffer.current = null;
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
            if (!checked) {
              playback.current++;
              source.current?.stop();
              source.current = null;
            }
            localStorage.setItem(KEY, checked ? 'on' : 'off');
          }}
        />
        <span>앱 안에서 탄산 알림음</span>
      </label>
      <button
        type="button"
        onClick={() =>
          void unlock()
            .then(play)
            .catch(() => setHint('이 브라우저에서 소리를 켜지 못했어요.'))
        }
      >
        탄산 소리 미리 듣기
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
