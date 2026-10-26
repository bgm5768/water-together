import { useEffect, useRef, useState } from 'react';
import './launch.css';

const launchSeenKey = `water-launch-seen:${import.meta.env.BASE_URL}`;

export function LaunchScreen({
  ready,
  error,
  onRetry,
}: {
  ready: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const started = useRef(performance.now());
  const seen = useRef(
    (() => {
      try {
        return localStorage.getItem(launchSeenKey) === 'yes';
      } catch {
        return false;
      }
    })(),
  );
  const [phase, setPhase] = useState<'enter' | 'leave' | 'done'>('enter');
  useEffect(() => {
    if (!ready) {
      setPhase('enter');
      started.current = performance.now();
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = Math.max(
      0,
      (reduced || seen.current ? 0 : 1050) - (performance.now() - started.current),
    );
    const fade = reduced ? 0 : seen.current ? 180 : 450;
    const exit = window.setTimeout(() => setPhase('leave'), delay);
    const done = window.setTimeout(() => {
      setPhase('done');
      seen.current = true;
      try {
        localStorage.setItem(launchSeenKey, 'yes');
      } catch {
        // Storage may be unavailable; keep the faster transition for this session.
      }
    }, delay + fade);
    return () => {
      clearTimeout(exit);
      clearTimeout(done);
    };
  }, [ready]);
  if (phase === 'done' && ready) return null;
  return (
    <section
      className={`launch-screen launch-${phase}${seen.current ? ' launch-returning' : ''}`}
      aria-label="Water Together 시작 화면"
      aria-busy={!ready && !error}
    >
      <div className="launch-wordmark" aria-hidden="true">
        WATER<span>TOGETHER</span>
      </div>
      <div className="launch-stage" aria-hidden="true">
        <div className="launch-ripple">
          <i />
          <i />
          <i />
        </div>
        <div className="launch-mark">
          <img
            src={`${import.meta.env.BASE_URL}brand/water-mark.svg`}
            alt=""
            width="180"
            height="180"
            fetchPriority="high"
          />
        </div>
        <span className="launch-bubble bubble-one" />
        <span className="launch-bubble bubble-two" />
        <span className="launch-bubble bubble-three" />
      </div>
      <div className="launch-caption">
        <p className="launch-eyebrow">둘이서, 꾸준히</p>
        <h1>함께 채우는 하루.</h1>
        <div className="launch-progress" aria-hidden="true">
          <span />
        </div>
        <p className="launch-status" role="status">
          {error ? '연결을 잠시 확인해 주세요.' : '우리의 공간을 불러오고 있어요.'}
        </p>
        {error && (
          <div className="launch-error">
            <p>{error}</p>
            <button type="button" onClick={onRetry}>
              다시 불러오기
            </button>
          </div>
        )}
      </div>
      <div className="launch-waves" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span className="launch-edition" aria-hidden="true">
        매일의 작은 습관, 함께 물
      </span>
    </section>
  );
}
