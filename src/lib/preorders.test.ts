import test from 'node:test';
import assert from 'node:assert/strict';
import { isStalePreorder, isDueForKitchen, kitchenDueAt, splitKitchenOrders, formatCollectionTime } from './preorders.ts';

const now = new Date('2026-10-22T10:00:00Z'); // 11:00 Dublin

test('ASAP orders are always on the kitchen board', () => {
  assert.equal(isDueForKitchen({ fulfillment_type: 'asap' }, now), true);
  assert.equal(isDueForKitchen({}, now), true);
});

test('a pre-order waits until its release time, then joins the kitchen', () => {
  const order = { fulfillment_type: 'scheduled', scheduled_for: '2026-10-22T11:45:00Z', kitchen_release_at: '2026-10-22T10:45:00Z' };
  assert.equal(isDueForKitchen(order, now), false);
  assert.equal(isDueForKitchen(order, new Date('2026-10-22T10:45:00Z')), true);
});

test('without a stored release time, the default lead is one hour', () => {
  const order = { fulfillment_type: 'scheduled', scheduled_for: '2026-10-22T11:30:00Z' };
  assert.equal(kitchenDueAt(order)?.toISOString(), '2026-10-22T10:30:00.000Z');
  assert.equal(isDueForKitchen(order, now), false);
});

test('an order already released by the server is always shown', () => {
  assert.equal(isDueForKitchen({ fulfillment_type: 'scheduled', scheduled_for: '2026-10-30T12:00:00Z', released_to_kitchen_at: '2026-10-22T09:00:00Z' }, now), true);
});

test('upcoming pre-orders are sorted by collection time', () => {
  const { kitchen, upcoming } = splitKitchenOrders([
    { fulfillment_type: 'scheduled', scheduled_for: '2026-10-23T12:00:00Z' },
    { fulfillment_type: 'asap' },
    { fulfillment_type: 'scheduled', scheduled_for: '2026-10-22T12:30:00Z' },
  ], now);
  assert.equal(kitchen.length, 1);
  assert.deepEqual(upcoming.map((o) => o.scheduled_for), ['2026-10-22T12:30:00Z', '2026-10-23T12:00:00Z']);
});

test('collection time shows the weekday only when it is not today', () => {
  assert.equal(formatCollectionTime('2026-10-22T11:45:00Z', now), '12:45');
  assert.equal(formatCollectionTime('2026-10-23T11:45:00Z', now), 'Fri 12:45');
  assert.equal(formatCollectionTime(null, now), '');
});

test('a pre-order long past its collection time never lands on the board', () => {
  const old = { fulfillment_type: 'scheduled', scheduled_for: '2026-10-09T16:30:00Z', kitchen_release_at: '2026-10-09T16:10:00Z' };
  assert.equal(isStalePreorder(old, now), true);
  const { kitchen, upcoming } = splitKitchenOrders([old, { fulfillment_type: 'asap' }], now);
  assert.equal(kitchen.length, 1);
  assert.equal(upcoming.length, 0);
  // Collection an hour ago is still live work.
  assert.equal(isStalePreorder({ fulfillment_type: 'scheduled', scheduled_for: '2026-10-22T09:00:00Z' }, now), false);
});
