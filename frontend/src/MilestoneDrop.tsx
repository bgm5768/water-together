import { useId } from 'react';

export function goalProgress(amount: number, goal: number) {
  const intake = Math.max(0, amount);
  const target = Math.max(1, goal);
  return {
    percent: Math.min(100, Math.floor((intake * 100) / target)),
    stage: Math.min(4, Math.floor((intake * 4) / target)),
    complete: amount >= goal && goal > 0,
  };
}

// The surrounding progress panel or calendar button provides the accessible label.
export function MilestoneDrop({ stage, className = '' }: { stage: number; className?: string }) {
  const id = useId();
  const level = Math.min(4, Math.max(0, stage));
  const shape = 'M32 4C27 14 8 31 8 48a24 24 0 0 0 48 0C56 31 37 14 32 4Z';
  return (
    <svg
      className={`milestone-drop ${className}`}
      viewBox="0 0 64 80"
      aria-hidden="true"
      focusable="false"
      data-stage={level}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={shape} />
        </clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#79c9ff" />
          <stop offset="1" stopColor="#287ff0" />
        </linearGradient>
      </defs>
      <path d={shape} fill="#e9f3ff" />
      <g clipPath={`url(#${id}-clip)`}>
        <rect
          className="milestone-water"
          x="6"
          y={76 - level * 18}
          width="52"
          height="76"
          fill={`url(#${id}-fill)`}
        />
      </g>
      <path d={shape} fill="none" stroke="#80b9f5" strokeWidth="2" />
      {level === 4 ? (
        <path
          d="m22 45 7 7 14-15"
          fill="none"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M19 37c2-5 5-8 8-12"
          fill="none"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
