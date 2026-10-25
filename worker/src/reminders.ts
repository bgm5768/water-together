import { dayBounds, localDate, type HydrationPlan } from '../../shared/time';
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

export function reminderMessage(plan: HydrationPlan) {
  const fmt = (n: number) => n.toLocaleString('ko-KR');
  return plan.amount_ml > 0
    ? {
        title: `지금 약 ${fmt(plan.amount_ml)} ml 마실 시간이에요 💧`,
        body: `지금 약 ${fmt(plan.amount_ml)} ml · 오늘 ${fmt(plan.consumed_ml)} / ${fmt(plan.goal_ml)} ml 마셨어요. 남은 ${fmt(plan.remaining_ml)} ml를 ${plan.remaining_count}회(이번 포함)에 나눠 계산했어요.${plan.remaining_count === 1 ? ' 오늘의 마지막 알림이에요.' : ''}`,
      }
    : {
        title: '오늘의 수분 목표를 채웠어요 💧',
        body: '목표를 달성했어요. 내 몸의 리듬에 맞춰 쉬어가세요.',
      };
}
