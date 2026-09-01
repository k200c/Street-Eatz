import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseStoreStatus, type StoreStatusPayload } from './storeStatus.ts';

/** The exact payload get_store_status() returned while the truck was closed. */
const CLOSED: StoreStatusPayload = {
  is_open: false,
  accepting_orders: false,
  reason: 'closed_manually',
  message: 'Closed',
  wait_time: null,
  opens_at: null,
  today: 'Tuesday',
  today_label: 'Closed',
  local_time: '20:46',
  checked_at: '2026-09-01T19:46:47.059043+00:00',
};

const OPEN: StoreStatusPayload = {
  is_open: true,
  accepting_orders: true,
  reason: 'open',
  message: 'Open until 19:00',
  wait_time: ' 20 mins ',
  opens_at: null,
  today: 'Thursday',
  today_label: '12:00-19:00',
  local_time: '13:10',
};

test('store status fails closed when the server cannot be read', () => {
  const status = normaliseStoreStatus(null, false, false);
  assert.equal(status.isStatusAvailable, false);
  assert.equal(status.isStoreOpen, false);
  assert.equal(status.acceptingOrders, false);
  assert.equal(status.waitTime, null);
});

test('never returns a wait time while closed', () => {
  const status = normaliseStoreStatus(CLOSED);
  assert.equal(status.isStoreOpen, false);
  assert.equal(status.waitTime, null);
});

test('a wait time sent while closed is still dropped', () => {
  // Defensive: the contradiction the browse test found was a wait time shown
  // beside a closed store. It cannot survive this layer, whatever the source.
  const status = normaliseStoreStatus({ ...CLOSED, wait_time: '20 mins' });
  assert.equal(status.waitTime, null);
});

test('an open store surfaces its trimmed wait time', () => {
  const status = normaliseStoreStatus(OPEN);
  assert.equal(status.isStoreOpen, true);
  assert.equal(status.acceptingOrders, true);
  assert.equal(status.waitTime, '20 mins');
  assert.equal(status.message, 'Open until 19:00');
});

test('accepting_orders is independent of is_open', () => {
  // Open for browsing but not taking orders is a legitimate state, and the
  // order button must follow accepting_orders, never is_open.
  const status = normaliseStoreStatus({ ...OPEN, accepting_orders: false });
  assert.equal(status.isStoreOpen, true);
  assert.equal(status.acceptingOrders, false);
});

test('production ignores a browser-requested developer bypass', () => {
  const status = normaliseStoreStatus(CLOSED, true, false);
  assert.equal(status.isStoreOpen, false);
  assert.equal(status.acceptingOrders, false);
  assert.equal(status.devModeEnabled, false);
});

test('development bypass opens the store but never invents a wait time', () => {
  const status = normaliseStoreStatus(CLOSED, true, true);
  assert.equal(status.isStoreOpen, true);
  assert.equal(status.acceptingOrders, true);
  assert.equal(status.devModeEnabled, true);
  assert.equal(status.waitTime, null);
});

test('closed status carries the copy the UI should render', () => {
  const status = normaliseStoreStatus(CLOSED);
  assert.equal(status.message, 'Closed');
  assert.equal(status.reason, 'closed_manually');
  assert.equal(status.today, 'Tuesday');
  assert.equal(status.todayLabel, 'Closed');
  assert.equal(status.localTime, '20:46');
});
