import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayBounds,
  dueSlots,
  nextSlot,
  localDate,
  dailySlots,
  hydrationAt,
  nextHydration,
} from '../../shared/time';
import { defaults, defaultReminders } from '../../shared/types';
const start = Date.parse('2025-05-05T02:00:00Z');
test('Seoul midnight and historical range use UTC bounds', () => {
  assert.deepEqual(dayBounds('2025-05-02', 'Asia/Seoul'), {
    start: '2025-05-01T15:00:00.000Z',
    end: '2025-05-02T15:00:00.000Z',
  });
  assert.equal(localDate(Date.parse('2025-05-01T15:00:00Z'), 'Asia/Seoul'), '2025-05-02');
  assert.throws(() => dayBounds('2025-02-30', 'Asia/Seoul'));
});
test('fixed defaults deduplicate 11:00, preserve explicit alarms and divide the goal exactly', () => {
  const slots = dailySlots(start, defaults);
  assert.deepEqual(
    slots.map((slot) => new Date(slot + 9 * 3600000).toISOString().slice(11, 16)),
    ['11:00', '11:20', '12:30', '13:00', '18:00', '20:00', '22:40'],
  );
  assert.deepEqual(hydrationAt(start, defaults, 0), { amount_ml: 286, remaining_ml: 2000 });
  assert.deepEqual(hydrationAt(slots[1], defaults, 800), { amount_ml: 200, remaining_ml: 1200 });
  assert.equal(nextHydration(start + 1, defaults, 800)?.at, new Date(slots[1]).toISOString());
  let total = 0;
  for (const slot of slots) total += hydrationAt(slot, defaults, total)!.amount_ml;
  assert.equal(total, 2000);
  assert.equal(hydrationAt(slots[6], defaults, 2000), null);
  assert.deepEqual(hydrationAt(slots[6], { ...defaults, stop_when_goal_reached: false }, 2000), {
    amount_ml: 0,
    remaining_ml: 0,
  });
  assert.equal(nextHydration(start, defaults, 2000)?.at, new Date(start + 86400000).toISOString());
});
test('close fixed times are all caught up with bounded delay and no interval fallback', () => {
  const s = {
    ...defaults,
    reminders: defaultReminders.map((row, i) => ({
      ...row,
      time: i === 0 ? '11:02' : '11:03',
      enabled: i < 2,
    })),
  };
  assert.deepEqual(dueSlots(start + 5 * 60000, s), [start + 2 * 60000, start + 3 * 60000]);
  assert.deepEqual(dueSlots(start + 13 * 60000, s), []);
  assert.equal(nextSlot(start, s), new Date(start + 2 * 60000).toISOString());
  assert.equal(nextSlot(start, { ...s, enabled: false }), null);
  assert.equal(nextSlot(start, { ...s, active_days: [] }), null);
  assert.equal(
    nextSlot(start, { ...s, reminders: s.reminders.map((row) => ({ ...row, enabled: false })) }),
    null,
  );
});
test('fixed times use local calendar weekday and never replay yesterday after midnight', () => {
  const s = {
    ...defaults,
    active_days: [1],
    reminders: defaultReminders.map((row, i) => ({ ...row, time: '23:58', enabled: i === 0 })),
  };
  assert.equal(dailySlots(start, s).length, 1);
  assert.deepEqual(dueSlots(Date.parse('2025-05-05T15:03:00Z'), s), []);
  assert.equal(dailySlots(start + 86400000, s).length, 0);
});
test('DST calendar days have 23 or 25 hours and schedules stay at local wall time', () => {
  for (const [date, hours] of [
    ['2025-03-09', 23],
    ['2025-11-02', 25],
  ] as const) {
    const b = dayBounds(date, 'America/New_York');
    assert.equal(Date.parse(b.end) - Date.parse(b.start), hours * 3600000);
    const s = { ...defaults, timezone: 'America/New_York' };
    const slots = dailySlots(Date.parse(b.start), s);
    assert.equal(slots.length, 7);
    assert.equal(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: s.timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(slots[0]),
      '11:00',
    );
  }
});
