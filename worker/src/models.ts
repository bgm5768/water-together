import type { Settings } from '../../shared/types';
export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  SUBSCRIPTION_KEY?: string;
}
export interface Actor {
  id: string;
  display_name: string;
  group_id: string;
  role: string;
}
export interface SettingsRow extends Omit<
  Settings,
  'enabled' | 'active_days' | 'stop_when_goal_reached'
> {
  user_id: string;
  enabled: number;
  active_days: string;
  stop_when_goal_reached: number;
}
export function settingsFrom(r: SettingsRow): Settings {
  return {
    enabled: !!r.enabled,
    start_time: r.start_time,
    end_time: r.end_time,
    interval_minutes: r.interval_minutes,
    active_days: JSON.parse(r.active_days),
    stop_when_goal_reached: !!r.stop_when_goal_reached,
    timezone: r.timezone,
    daily_goal_ml: r.daily_goal_ml,
  };
}
export async function readSettings(db: D1Database, id: string) {
  const row = await db
    .prepare('SELECT * FROM notification_settings WHERE user_id=?')
    .bind(id)
    .first<SettingsRow>();
  if (!row) throw new Error('SETTINGS_MISSING');
  return settingsFrom(row);
}
