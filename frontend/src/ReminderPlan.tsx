import { DateTime } from 'luxon';
import { Droplet } from 'lucide-react';
import { dailySlots, nextHydration } from '../../shared/time';
import type { Settings } from '../../shared/types';

export function ReminderPlan({ settings, now }: { settings: Settings; now: number }) {
  const next = nextHydration(now, settings, 0);
  const slots = next ? dailySlots(Date.parse(next.at), settings) : [];
  const portion = slots.length ? Math.ceil(settings.daily_goal_ml / slots.length) : 0;
  return (
    <div className="reminder-plan" aria-live="polite">
      <span className="plan-eyebrow">
        <Droplet size={15} /> 나의 물 마시기 계획
      </span>
      {slots.length ? (
        <>
          <strong>
            {settings.daily_goal_ml.toLocaleString('ko-KR')} ml <span>÷</span> {slots.length}회{' '}
            <span>≈</span> {portion} ml씩
          </strong>
          <p>
            {DateTime.fromMillis(slots[0], { zone: settings.timezone }).toFormat('M/d')} 일정 기준 ·
            마신 양을 기록하면 남은 양을 남은 시간에 다시 나눠요. 계획보다 앞서 마셨다면 알림은
            쉬어요.
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
      <small>설정 저장 후 적용 · 종료 시각은 취침 시간으로 비워둬요.</small>
    </div>
  );
}
