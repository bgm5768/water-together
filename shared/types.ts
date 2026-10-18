export const reminderLabels = {
  wake: '기상 이후',
  before_breakfast: '조식 전',
  after_breakfast: '아침 식사 후',
  before_lunch: '점심 식사 전',
  after_lunch: '점심 식사 후',
  before_dinner: '저녁 식사 전',
  after_dinner: '저녁 식사 후',
  bedtime: '취침 전',
} as const;
export interface Reminder {
  id: keyof typeof reminderLabels;
  time: string;
  enabled: boolean;
}
export const defaultReminders: Reminder[] = [
  { id: 'wake', time: '11:00', enabled: true },
  { id: 'before_breakfast', time: '11:20', enabled: true },
  { id: 'after_breakfast', time: '12:30', enabled: true },
  { id: 'before_lunch', time: '11:00', enabled: true },
  { id: 'after_lunch', time: '13:00', enabled: true },
  { id: 'before_dinner', time: '18:00', enabled: true },
  { id: 'after_dinner', time: '20:00', enabled: true },
  { id: 'bedtime', time: '22:40', enabled: true },
];
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
  reminders?: Reminder[];
  partner_notifications?: boolean;
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
  reminders: defaultReminders,
  partner_notifications: true,
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
export interface MonthData {
  month: string;
  timezone: string;
  members: Omit<Member, 'total_ml'>[];
  days: { date: string; totals: Record<string, number> }[];
}
export interface Me {
  id: string;
  display_name: string;
  group_id: string;
  settings: Settings;
  subscription_count: number;
  next_notification: string | null;
  next_amount_ml?: number | null;
  last_scheduled_notification?: {
    scheduled_at: string;
    sent_at: string | null;
    status: string;
  } | null;
  vapid_public_key: string | null;
}
