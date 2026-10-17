import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayBounds, dueSlot, nextSlot, localDate } from '../../shared/time';
import { defaults } from '../../shared/types';
test('Seoul midnight and historical range use UTC bounds', () => {
  assert.deepEqual(dayBounds('2025-05-02', 'Asia/Seoul'), {
    start: '2025-05-01T15:00:00.000Z',
    end: '2025-05-02T15:00:00.000Z',
  });
  assert.equal(localDate(Date.parse('2025-05-01T15:00:00Z'), 'Asia/Seoul'), '2025-05-02');
  assert.throws(() => dayBounds('2025-02-30', 'Asia/Seoul'));
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
