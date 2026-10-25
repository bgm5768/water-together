import { DateTime } from 'luxon';
import { defaultReminders, type Settings } from './types';

export function dayBounds(date: string, zone: string) {
  const start = DateTime.fromISO(date, { zone }).startOf('day');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !start.isValid || start.toISODate() !== date)
    throw new Error('INVALID_DATE');
  return { start: start.toUTC().toISO()!, end: start.plus({ days: 1 }).toUTC().toISO()! };
}
export function localDate(now: number, zone: string) {
  return DateTime.fromMillis(now, { zone }).toISODate()!;
}
// Fixed local times, no interval mode. Equal times share one notification.
export function dailySlots(now: number, s: Settings): number[] {
  const date = DateTime.fromMillis(now, { zone: s.timezone }).startOf('day');
  if (!s.enabled || !date.isValid || !s.active_days.includes(date.weekday)) return [];
  const slots = (s.reminders ?? defaultReminders)
    .filter((r) => r.enabled)
    .flatMap((r) => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) return [];
      const [hour, minute] = r.time.split(':').map(Number);
      return [date.set({ hour, minute }).toMillis()];
    });
  return [...new Set(slots)].sort((a, b) => a - b);
}
export function dueSlots(now: number, s: Settings): number[] {
  return dailySlots(now, s).filter((slot) => slot <= now && now - slot < 10 * 60000);
}
export function dueSlot(now: number, s: Settings): number | null {
  return dueSlots(now, s).at(-1) ?? null;
}
export function windowOpen(now: number, s: Settings) {
  return dailySlots(now, s).some((slot) => slot <= now && now - slot <= 15 * 60000);
}
export function nextSlot(now: number, s: Settings): string | null {
  return nextHydration(now, s, 0)?.at ?? null;
}
export interface HydrationPlan {
  amount_ml: number;
  remaining_ml: number;
  consumed_ml: number;
  goal_ml: number;
  remaining_count: number;
}
function portionAt(index: number, count: number, s: Settings, total: number): HydrationPlan | null {
  if (index < 0) return null;
  const remaining = Math.max(0, s.daily_goal_ml - total);
  if (!remaining && s.stop_when_goal_reached) return null;
  // Explicit alarms always run at the selected times; only the goal-stop setting skips them.
  return {
    amount_ml: Math.ceil(remaining / (count - index)),
    remaining_ml: remaining,
    consumed_ml: total,
    goal_ml: s.daily_goal_ml,
    remaining_count: count - index,
  };
}
export function hydrationNow(now: number, s: Settings, total: number) {
  return portionAt(0, 1 + dailySlots(now, s).filter((slot) => slot > now).length, s, total);
}
export function hydrationAt(slot: number, s: Settings, total: number, now = slot) {
  const slots = dailySlots(slot, s);
  if (
    !slots.includes(slot) ||
    now < slot ||
    localDate(slot, s.timezone) !== localDate(now, s.timezone)
  )
    return null;
  return hydrationNow(now, s, total);
}
export function nextHydration(now: number, s: Settings, total: number) {
  const today = DateTime.fromMillis(now, { zone: s.timezone });
  for (let d = 0; d <= 7; d++) {
    const slots = dailySlots(today.plus({ days: d }).toMillis(), s);
    for (const [index, slot] of slots.entries()) {
      if (slot < now) continue;
      const plan = portionAt(index, slots.length, s, d === 0 ? total : 0);
      if (plan) return { at: new Date(slot).toISOString(), ...plan };
    }
  }
  return null;
}
