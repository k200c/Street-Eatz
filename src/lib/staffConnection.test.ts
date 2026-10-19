import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StaffActionError,
  formatCheckedAt,
  isStatusStale,
  storeToggleFailureMessage,
  withTimeout,
  confirmStoreToggle,
} from './staffConnection.ts';

test('withTimeout rejects a request that never settles', async () => {
  const never = new Promise(() => {});
  await assert.rejects(withTimeout(never, 20, 'no answer'), (error: unknown) => {
    assert.ok(error instanceof StaffActionError);
    assert.equal(error.kind, 'timeout');
    return true;
  });
});

test('withTimeout passes a prompt result through', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 1000, 'no answer'), 7);
});

test('withTimeout passes a prompt failure through unchanged', async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error('rls')), 1000, 'no answer'), /rls/);
});

test('status is stale when never read or older than the limit', () => {
  const now = 1_000_000;
  assert.equal(isStatusStale(0, now), true);
  assert.equal(isStatusStale(undefined, now), true);
  assert.equal(isStatusStale(now - 60_000, now), false);
  assert.equal(isStatusStale(now - 4 * 60_000, now), true);
});

test('checked-at label is Irish local time', () => {
  // 13:00 UTC on 16 Oct 2026 is 14:00 in Dublin (IST, UTC+1).
  assert.equal(formatCheckedAt(Date.UTC(2026, 9, 16, 13, 0)), '14:00');
  assert.equal(formatCheckedAt(null), null);
});

test('a lost login tells staff to sign in again and says the store did not change', () => {
  const message = storeToggleFailureMessage(new StaffActionError('x', 'signed_out'), true);
  assert.equal(message.title, 'Store NOT opened');
  assert.match(message.description, /sign back in/i);
});

test('a timeout warns the write may complete instead of claiming the store is definitely closed', () => {
  const message = storeToggleFailureMessage(new StaffActionError('x', 'timeout'), false);
  assert.equal(message.title, 'Store closing NOT confirmed');
  assert.match(message.description, /may still complete/i);
});

test('opening and closing succeed only with explicit matching server states', async () => {
  for (const wanted of [true, false]) {
    await confirmStoreToggle(async () => ({ data: { is_open: wanted, accepting_orders: wanted }, error: null }), wanted);
  }
});

test('an empty or contradictory response cannot confirm closing or opening', async () => {
  for (const data of [null, {}, { is_open: false }, { is_open: true, accepting_orders: false }]) {
    for (const wanted of [true, false]) {
      await assert.rejects(confirmStoreToggle(async () => ({ data, error: null }), wanted),
        (error: unknown) => error instanceof StaffActionError && error.kind === 'not_confirmed');
    }
  }
});

test('a provider error rejects even with a success-looking payload', async () => {
  await assert.rejects(confirmStoreToggle(async () => ({
    data: { is_open: true, accepting_orders: true }, error: new Error('RPC unavailable'),
  }), true), (error: unknown) => error instanceof StaffActionError && error.kind === 'not_confirmed');
});

test('a hung confirmation request has a deadline', async () => {
  await assert.rejects(confirmStoreToggle(() => new Promise(() => {}), true, 20),
    (error: unknown) => error instanceof StaffActionError && error.kind === 'timeout');
});

test('a rejected read after a write reports unknown state rather than unsaved state', async () => {
  await assert.rejects(confirmStoreToggle(async () => { throw new Error('network down'); }, true),
    (error: unknown) => error instanceof StaffActionError && error.kind === 'not_confirmed');
});
