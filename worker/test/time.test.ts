import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayBounds,
  dueSlot,
  nextSlot,
  localDate,
  dailySlots,
  hydrationAt,
  nextHydration,
} from '../../shared/time';
import { defaults } from '../../shared/types';
test('Seoul midnight and historical range use UTC bounds', () => {
  assert.deepEqual(dayBounds('2025-05-02', 'Asia/Seoul'), {
    start: '2025-05-01T15:00:00.000Z',
    end: '2025-05-02T15:00:00.000Z',
  });
  assert.equal(localDate(Date.parse('2025-05-01T15:00:00Z'), 'Asia/Seoul'), '2025-05-02');
  assert.throws(() => dayBounds('2025-02-30', 'Asia/Seoul'));
});

test('2000 ml splits across 10 slots, adjusts to intake, and skips ahead-of-plan slots', () => {
  const s = { ...defaults, start_time: '08:00', end_time: '18:00' };
  const start = Date.parse('2025-05-04T23:00:00Z');
  const slots = dailySlots(start, s);
  assert.equal(slots.length, 10);
  assert.deepEqual(hydrationAt(start, s, 0), { amount_ml: 200, remaining_ml: 2000 });
  assert.deepEqual(hydrationAt(slots[5], s, 500), { amount_ml: 300, remaining_ml: 1500 });
  assert.equal(hydrationAt(slots[1], s, 800), null);
  assert.equal(hydrationAt(slots[3], s, 800), null);
  assert.deepEqual(hydrationAt(slots[4], s, 800), { amount_ml: 200, remaining_ml: 1200 });
  assert.equal(hydrationAt(slots[9], s, 2000), null);
  assert.deepEqual(hydrationAt(slots[9], { ...s, stop_when_goal_reached: false }, 2000), {
    amount_ml: 0,
    remaining_ml: 0,
  });
  assert.equal(nextHydration(start, s, 800)?.at, new Date(slots[4]).toISOString());
  assert.equal(nextHydration(start, s, 2000)?.at, new Date(start + 86400000).toISOString());
  let total = 0;
  for (const slot of slots) total += hydrationAt(slot, s, total)?.amount_ml || 0;
  assert.equal(total, 2000);
});

test('uneven intervals conserve goal and overnight slots partition local calendar days', () => {
  const at = Date.parse('2025-05-05T00:00:00Z');
  const s = { ...defaults, interval_minutes: 45, start_time: '09:02', end_time: '12:00' };
  const slots = dailySlots(at, s);
  assert.equal(slots.length, 4);
  assert.equal(new Date(slots.at(-1)!).toISOString(), '2025-05-05T02:17:00.000Z');
  let total = 0;
  for (const slot of dailySlots(at, defaults))
    total += hydrationAt(slot, defaults, total)?.amount_ml || 0;
  assert.equal(total, 2000);
  const night = { ...defaults, start_time: '22:00', end_time: '02:00', active_days: [1] };
  assert.equal(dailySlots(at, night).length, 2);
  assert.equal(dailySlots(at + 86400000, night).length, 2);
  assert.equal(dailySlots(at + 2 * 86400000, night).length, 0);
  assert.equal(nextHydration(at, { ...s, enabled: false }, 0), null);
  assert.equal(nextHydration(at, { ...s, active_days: [] }, 0), null);
});
test('DST days have 23 or 25 hours', () => {
  for (const [date, hours] of [
    ['2025-03-09', 23],
    ['2025-11-02', 25],
  ] as const) {
    const b = dayBounds(date, 'America/New_York');
    assert.equal(Date.parse(b.end) - Date.parse(b.start), hours * 3600000);
  }
});
test('overnight schedule uses start weekday and excludes end', () => {
  const s = { ...defaults, start_time: '22:00', end_time: '02:00', active_days: [1] };
  assert.equal(dueSlot(Date.parse('2025-05-05T16:00:00Z'), s), Date.parse('2025-05-05T16:00:00Z'));
  assert.equal(dueSlot(Date.parse('2025-05-05T17:00:00Z'), s), null);
  assert.equal(dueSlot(Date.parse('2025-05-06T16:00:00Z'), s), null);
});
test('45 minute slots, delayed cron, disabled and empty weekdays', () => {
  const s = { ...defaults, interval_minutes: 45, start_time: '09:02' };
  assert.equal(dueSlot(Date.parse('2025-05-05T00:50:00Z'), s), Date.parse('2025-05-05T00:47:00Z'));
  assert.equal(dueSlot(Date.parse('2025-05-05T01:00:00Z'), s), null);
  assert.equal(nextSlot(Date.parse('2025-05-05T00:50:00Z'), s), '2025-05-05T01:32:00.000Z');
  assert.equal(nextSlot(Date.now(), { ...s, enabled: false }), null);
  assert.equal(nextSlot(Date.now(), { ...s, active_days: [] }), null);
});
