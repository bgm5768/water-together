import { useEffect, useRef, useState } from 'react';
import './launch.css';

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
  const [phase, setPhase] = useState<'enter' | 'leave' | 'done'>('enter');
  useEffect(() => {
    if (!ready) {
      setPhase('enter');
      started.current = performance.now();
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = Math.max(0, (reduced ? 0 : 1050) - (performance.now() - started.current));
    const exit = window.setTimeout(() => setPhase('leave'), delay);
    const done = window.setTimeout(() => setPhase('done'), delay + (reduced ? 0 : 450));
    return () => {
      clearTimeout(exit);
      clearTimeout(done);
    };
  }, [ready]);
  if (phase === 'done' && ready) return null;
  return (
    <section
      className={`launch-screen launch-${phase}`}
      aria-label="Water Together 시작 화면"
      aria-busy={!ready && !error}
    >
      <div className="launch-atmosphere" aria-hidden="true" />
      <div className="launch-wordmark" aria-hidden="true">
        WATER<span>TOGETHER</span>
      </div>
      <div className="launch-stage" aria-hidden="true">
        <div className="launch-orbit launch-orbit-back" />
        <div className="launch-sculpture">
          <img
            src={`${import.meta.env.BASE_URL}brand/water-glass.webp`}
            alt=""
            width="768"
            height="768"
            fetchPriority="high"
          />
          <div className="launch-light-sweep" />
        </div>
        <div className="launch-pool">
          <i />
          <i />
          <i />
        </div>
        <div className="launch-orbit launch-orbit-front" />
        <div className="launch-particle particle-one" />
        <div className="launch-particle particle-two" />
      </div>
      <div className="launch-caption">
        <p className="launch-eyebrow">A LITTLE WATER. A LITTLE CLOSER.</p>
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
      <span className="launch-edition" aria-hidden="true">
        YOUR DAILY FLOW
      </span>
    </section>
  );
}
