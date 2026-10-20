import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFailureMessage, reportCheckoutFailure } from './checkoutAlerts.ts';

test('messages are ASCII, single-line and short', () => {
  assert.equal(cleanFailureMessage(new Error('Payment “failed” – 502\n retry')), 'Payment failed 502 retry');
  assert.equal(cleanFailureMessage('x'.repeat(500)).length, 160);
  assert.equal(cleanFailureMessage({}), '');
});

test('reports the stage, message and order to the RPC', async () => {
  let seen: { fn: string; args: Record<string, unknown> } | null = null;
  const ok = await reportCheckoutFailure({ rpc: async (fn, args) => { seen = { fn, args }; return { error: null }; } },
    'payment_session', 'Payment workflow failed', 'abc');
  assert.equal(ok, true);
  assert.deepEqual(seen, { fn: 'report_checkout_failure', args: { p_stage: 'payment_session', p_message: 'Payment workflow failed', p_order_id: 'abc' } });
});

test('never throws, even when the RPC throws or hangs', async () => {
  assert.equal(await reportCheckoutFailure({ rpc: () => { throw new Error('down'); } }, 'unexpected'), false);
  assert.equal(await reportCheckoutFailure({ rpc: () => new Promise(() => {}) }, 'unexpected', 'x', null, 20), false);
  assert.equal(await reportCheckoutFailure({ rpc: async () => ({ error: { message: 'no' } }) }, 'unexpected'), false);
});
