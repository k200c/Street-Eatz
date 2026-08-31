import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStoreStatus } from './storeStatus.ts';

test('store status fails closed when settings are unavailable', () => {
  assert.deepEqual(deriveStoreStatus(null, false, false), {
    dbStoreOpen: false,
    devModeEnabled: false,
    isStatusAvailable: false,
    isStoreOpen: false,
    currentWaitTime: null,
  });
});

test('production ignores a browser-requested developer bypass', () => {
  const status = deriveStoreStatus(
    { is_store_open: false, current_wait_time: '20 mins' },
    true,
    false,
  );

  assert.equal(status.isStoreOpen, false);
  assert.equal(status.devModeEnabled, false);
});

test('development bypass is explicit and preserves verified wait time', () => {
  const status = deriveStoreStatus(
    { is_store_open: false, current_wait_time: ' 35 mins ' },
    true,
    true,
  );

  assert.equal(status.isStoreOpen, true);
  assert.equal(status.devModeEnabled, true);
  assert.equal(status.currentWaitTime, '35 mins');
});
