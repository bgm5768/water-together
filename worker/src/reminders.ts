import { dayBounds, localDate } from '../../shared/time';
import type { Settings } from '../../shared/types';
import type { Env } from './models';

export async function intakeToday(env: Env, user: string, s: Settings, now: number) {
  const b = dayBounds(localDate(now, s.timezone), s.timezone);
  const r = await env.DB.prepare(
    'SELECT COALESCE(SUM(amount_ml),0) total FROM water_logs WHERE user_id=? AND consumed_at>=? AND consumed_at<?',
  )
    .bind(user, b.start, b.end)
    .first<{ total: number }>();
  return r?.total || 0;
}

export function reminderMessage(plan: { amount_ml: number; remaining_ml: number }) {
  return plan.amount_ml > 0
    ? {
        title: `이번에는 약 ${plan.amount_ml.toLocaleString('ko-KR')} ml 💧`,
        body: `남은 목표 ${plan.remaining_ml.toLocaleString('ko-KR')} ml를 남은 알림 시간에 나눴어요. 천천히 나눠 마시고 기록해 주세요.`,
      }
    : {
        title: '오늘의 수분 목표를 채웠어요 💧',
        body: '목표를 달성했어요. 내 몸의 리듬에 맞춰 쉬어가세요.',
      };
}
