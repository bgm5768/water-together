import { defaultReminders, type Settings } from '../../shared/types';

export function settingsEqual(a: Settings, b: Settings): boolean {
  const aReminders = a.reminders ?? defaultReminders;
  const bReminders = b.reminders ?? defaultReminders;
  return (
    a.enabled === b.enabled &&
    a.start_time === b.start_time &&
    a.end_time === b.end_time &&
    a.interval_minutes === b.interval_minutes &&
    a.stop_when_goal_reached === b.stop_when_goal_reached &&
    a.timezone === b.timezone &&
    a.daily_goal_ml === b.daily_goal_ml &&
    (a.default_drink_ml ?? 200) === (b.default_drink_ml ?? 200) &&
    (a.partner_notifications ?? true) === (b.partner_notifications ?? true) &&
    a.active_days.length === b.active_days.length &&
    a.active_days.every((day) => b.active_days.includes(day)) &&
    aReminders.length === bReminders.length &&
    aReminders.every((reminder) =>
      bReminders.some(
        (saved) =>
          saved.id === reminder.id &&
          saved.time === reminder.time &&
          saved.enabled === reminder.enabled,
      ),
    )
  );
}
