import { DateTime } from 'luxon';
import { Droplet } from 'lucide-react';
import { dailySlots, nextHydration } from '../../shared/time';
import type { Settings } from '../../shared/types';

export function ReminderPlan({
  settings,
  now,
  total,
}: {
  settings: Settings;
  now: number;
  total: number;
}) {
  const next = nextHydration(now, settings, total);
  const slots = next
    ? dailySlots(Date.parse(next.at), settings).filter((slot) => slot >= Date.parse(next.at))
    : [];
  return (
    <div className="reminder-plan" aria-live="polite">
      <span className="plan-eyebrow">
        <Droplet size={15} /> 나의 물 마시기 계획
      </span>
      {next && slots.length ? (
        <>
          <strong>다음 알림에 약 {next.amount_ml.toLocaleString('ko-KR')} ml</strong>
          <p>
            {DateTime.fromMillis(slots[0], { zone: settings.timezone }).toFormat('M/d HH:mm')} 기준
            · 남은 목표 {next.remaining_ml.toLocaleString('ko-KR')} ml ÷ 남은 알림{' '}
            {next.remaining_count}회. 마신 양과 현재 시간에 맞춰 다시 계산해요.
          </p>
          <div className="plan-timeline" aria-label="알림 시간표">
            {slots.map((slot) => (
              <span key={slot}>
                <i />
                <time>
                  {DateTime.fromMillis(slot, { zone: settings.timezone }).toFormat('HH:mm')}
                </time>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p>알림을 켜고 받을 요일과 시간을 선택하면 분배 계획이 보여요.</p>
      )}
      <small>목표 달성 후 알림은 ‘알림 설정’의 ‘알림 쉬기’를 따라요.</small>
    </div>
  );
}
