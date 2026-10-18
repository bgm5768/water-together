import { useEffect, useRef, useState } from 'react';

const KEY = 'water-reminder-sound';
const SOUND_URL = `${import.meta.env.BASE_URL}audio/can-pour.mp3`;
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
      setHint('캔 따고 물 따르기 미리 듣기를 눌러 이 화면의 소리를 켜주세요.');
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
    setHint('캔을 톡 따고, 잔에 시원하게 따르는 소리예요. 앱이 열린 동안 알림에 사용해요.');
  }
  useEffect(() => {
    if (!enabled) return;
    const gesture = () => {
      void unlock().catch(() => {});
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'WATER_REMINDER' && document.visibilityState === 'visible')
        void play().catch(() =>
          setHint('소리를 불러오지 못했어요. 미리 듣기로 다시 시도해주세요.'),
        );
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
        <span>앱 안에서 물소리 알림</span>
      </label>
      <button
        type="button"
        onClick={() =>
          void unlock()
            .then(play)
            .catch(() => setHint('이 브라우저에서 소리를 켜지 못했어요.'))
        }
      >
        캔 따고 물 따르기 미리 듣기
      </button>
      {hint && (
        <p className="field-hint" role="status">
          {hint}
        </p>
      )}
      <p className="field-hint">
        앱을 보고 있을 때는 위 효과음, 화면이 꺼져 있거나 앱을 닫았을 때는 휴대폰에 설정된 알림음이
        나요.
      </p>
      <details className="sound-help">
        <summary>화면이 꺼져 있을 때도 이 소리를 쓰려면</summary>
        <p>
          기본 알림음이 들리면 알림은 정상적으로 도착한 거예요. 웹 앱은 잠금 상태의 알림음을 직접
          바꿀 수 없어요.
        </p>
        <a className="text-button" href={SOUND_URL} download="함께물-캔따고물따르기.mp3">
          물소리 알림음 내려받기
        </a>
        <ol>
          <li>다운로드한 MP3 파일을 휴대폰의 Notifications 폴더에 복사해 주세요.</li>
          <li>
            도착한 알림을 길게 누르고 설정 → 알림 카테고리 → 소리에서 이 파일을 선택해 주세요.
          </li>
          <li>앱을 닫거나 화면을 잠근 후 다음 알림에서 확인해 주세요.</li>
        </ol>
        <p>
          Android 기종·브라우저에 따라 메뉴 이름과 파일 선택 지원이 달라요. 해당 메뉴가 없다면
          휴대폰 전체 기본 알림음에서 선택해야 할 수 있어요.
        </p>
        <a
          href="https://www.samsung.com/ph/support/mobile-devices/how-to-set-a-music-file-as-a-notification-sound-for-apps-on-your-galaxy-phone/"
          target="_blank"
          rel="noreferrer"
        >
          갤럭시 알림음 설정 안내
        </a>
      </details>
    </div>
  );
}
