import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreorderSlots, findNextPreorderDate, parseTimeMinutes, zonedDateTimeToUtc } from './preorderSlots.ts';

const hours = {
  '0': { start: '13:00', end: '14:00' },
  '4': { start: '12:00', end: '13:00' },
  '5': { start: '12:00', end: '13:00' },
  '6': { start: '13:00', end: '14:00' },
};

test('time parsing fails closed for malformed or impossible values', () => {
  assert.equal(parseTimeMinutes('12:15'), 735);
  assert.equal(parseTimeMinutes('24:00'), null);
  assert.equal(parseTimeMinutes('12:60'), null);
  assert.equal(parseTimeMinutes('noon'), null);
});

test('slot generation respects opening hours, interval, and notice window', () => {
  const slots = buildPreorderSlots({
    date: '2026-08-29',
    hoursByDay: hours,
    intervalMinutes: 15,
    earliest: new Date('2026-08-29T12:20:00.000Z'),
    latest: new Date('2026-08-29T13:00:00.000Z'),
  });
  assert.deepEqual(slots.map((slot) => slot.iso), [
    '2026-08-29T12:30:00.000Z',
    '2026-08-29T12:45:00.000Z',
  ]);
});

test('Dublin wall-clock slots convert correctly across daylight-saving time', () => {
  assert.equal(zonedDateTimeToUtc('2026-06-20', 13 * 60)?.toISOString(), '2026-06-20T12:00:00.000Z');
  assert.equal(zonedDateTimeToUtc('2026-12-20', 13 * 60)?.toISOString(), '2026-12-20T13:00:00.000Z');
  assert.equal(zonedDateTimeToUtc('2026-03-29', 90), null);
});

test('closed days and invalid configured hours expose no slots', () => {
  const boundary = {
    earliest: new Date('2026-08-30T23:00:00.000Z'),
    latest: new Date('2026-09-01T22:59:00.000Z'),
  };
  assert.deepEqual(buildPreorderSlots({
    date: '2026-08-31',
    hoursByDay: hours,
    intervalMinutes: 15,
    ...boundary,
  }), []);
  assert.deepEqual(buildPreorderSlots({
    date: '2026-08-31',
    hoursByDay: { '1': { start: '18:00', end: '12:00' } },
    intervalMinutes: 15,
    ...boundary,
  }), []);
});

test('next-date search skips closed days and returns the first valid slot set', () => {
  const next = findNextPreorderDate({
    startDate: '2026-08-31', // Monday
    maxDaysToScan: 7,
    hoursByDay: hours,
    intervalMinutes: 15,
    earliest: new Date('2026-08-30T23:00:00.000Z'),
    latest: new Date('2026-09-06T22:59:00.000Z'),
  });
  assert.equal(next?.date, '2026-09-03');
  assert.equal(next?.slots.length, 4);
});
