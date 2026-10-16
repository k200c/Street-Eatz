import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StaffActionError,
  formatCheckedAt,
  isStatusStale,
  storeToggleFailureMessage,
  withTimeout,
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

test('a hung request is treated as a lost login', () => {
  const message = storeToggleFailureMessage(new StaffActionError('x', 'timeout'), false);
  assert.equal(message.title, 'Store NOT closed');
  assert.match(message.description, /lost its login/i);
});
