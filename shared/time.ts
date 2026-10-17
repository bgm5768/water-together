import { DateTime } from 'luxon';
import type { Settings } from './types';
export function dayBounds(date: string, zone: string) {
  const start = DateTime.fromISO(date, { zone }).startOf('day');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !start.isValid || start.toISODate() !== date)
    throw new Error('INVALID_DATE');
  return { start: start.toUTC().toISO()!, end: start.plus({ days: 1 }).toUTC().toISO()! };
}
export function localDate(now: number, zone: string) {
  return DateTime.fromMillis(now, { zone }).toISODate()!;
}
function windowFor(date: DateTime, s: Settings) {
  const [sh, sm] = s.start_time.split(':').map(Number),
    [eh, em] = s.end_time.split(':').map(Number);
  const start = date.startOf('day').set({ hour: sh, minute: sm });
  let end = date.startOf('day').set({ hour: eh, minute: em });
  if (s.end_time <= s.start_time) end = end.plus({ days: 1 });
  return {
    start: start.toMillis(),
    end: end.toMillis(),
    active: s.active_days.includes(date.weekday),
  };
}
// End is exclusive. Overnight weekdays belong to the day the window starts.
export function dueSlot(now: number, s: Settings): number | null {
  if (!s.enabled) return null;
  const today = DateTime.fromMillis(now, { zone: s.timezone });
  for (const day of [today.minus({ days: 1 }), today]) {
    const w = windowFor(day, s);
    if (w.active && now >= w.start && now < w.end) {
      const slot =
        w.start +
        Math.floor((now - w.start) / (s.interval_minutes * 60000)) * s.interval_minutes * 60000;
      // No stale catch-up burst after a long outage. Normal cron delay: up to 5 min.
      if (now - slot < 10 * 60000) return slot;
    }
  }
  return null;
}
export function windowOpen(now: number, s: Settings) {
  if (!s.enabled) return false;
  const today = DateTime.fromMillis(now, { zone: s.timezone });
  return [today.minus({ days: 1 }), today].some((d) => {
    const w = windowFor(d, s);
    return w.active && now >= w.start && now < w.end;
  });
}
export function nextSlot(now: number, s: Settings): string | null {
  if (!s.enabled || !s.active_days.length) return null;
  const today = DateTime.fromMillis(now, { zone: s.timezone });
  let best = Infinity;
  for (let d = -1; d <= 8; d++) {
    const w = windowFor(today.plus({ days: d }), s);
    if (!w.active) continue;
    const step = s.interval_minutes * 60000;
    const slot = w.start + Math.max(0, Math.ceil((now - w.start) / step)) * step;
    if (slot < w.end && slot >= now) best = Math.min(best, slot);
  }
  return Number.isFinite(best) ? new Date(best).toISOString() : null;
}
