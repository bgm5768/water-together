export interface Settings {
  enabled: boolean;
  start_time: string;
  end_time: string;
  interval_minutes: number;
  active_days: number[];
  stop_when_goal_reached: boolean;
  timezone: string;
  daily_goal_ml: number;
  default_drink_ml: number;
}
export const defaults: Settings = {
  enabled: true,
  start_time: '09:00',
  end_time: '22:00',
  interval_minutes: 60,
  active_days: [1, 2, 3, 4, 5, 6, 7],
  stop_when_goal_reached: true,
  timezone: 'Asia/Seoul',
  daily_goal_ml: 2000,
  default_drink_ml: 200,
};
export interface WaterLog {
  id: string;
  user_id: string;
  group_id: string;
  amount_ml: number;
  consumed_at: string;
  created_at: string;
  updated_at: string;
}
export interface Member {
  id: string;
  display_name: string;
  daily_goal_ml: number;
  total_ml: number;
}
export interface DayData {
  date: string;
  timezone: string;
  members: Member[];
  logs: WaterLog[];
}
export interface Me {
  id: string;
  display_name: string;
  group_id: string;
  settings: Settings;
  subscription_count: number;
  next_notification: string | null;
  next_amount_ml?: number | null;
  vapid_public_key: string | null;
}
