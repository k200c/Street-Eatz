import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCheckoutSession, isGuestUser, GUEST_CHECKOUT_UNAVAILABLE, type CheckoutAuthClient } from './guestCheckout.ts';

const client = (opts: { existing?: boolean; anonOk?: boolean; anonThrows?: boolean }) => {
  let anonCalls = 0;
  const auth: CheckoutAuthClient = {
    getSession: async () => ({ data: { session: opts.existing ? { user: 'me' } : null } }),
    signInAnonymously: async () => {
      anonCalls += 1;
      if (opts.anonThrows) throw new Error('network');
      return opts.anonOk
        ? { data: { session: { user: 'guest' } }, error: null }
        : { data: { session: null }, error: { message: 'Anonymous sign-ins are disabled' } };
    },
  };
  return { auth, calls: () => anonCalls };
};

test('a signed-in customer keeps their own session', async () => {
  const c = client({ existing: true, anonOk: true });
  assert.deepEqual(await ensureCheckoutSession(c.auth), { ok: true, startedGuestSession: false });
  assert.equal(c.calls(), 0);
});

test('a guest gets a guest session and is never asked to log in', async () => {
  const c = client({ existing: false, anonOk: true });
  assert.deepEqual(await ensureCheckoutSession(c.auth), { ok: true, startedGuestSession: true });
  assert.equal(c.calls(), 1);
});

test('if guest sign-in is switched off, the customer gets a clear message, not "session expired"', async () => {
  const result = await ensureCheckoutSession(client({ existing: false, anonOk: false }).auth);
  assert.deepEqual(result, { ok: false, message: GUEST_CHECKOUT_UNAVAILABLE });
  assert.doesNotMatch(GUEST_CHECKOUT_UNAVAILABLE, /log in|session expired/i);
});

test('a network failure is handled, not thrown', async () => {
  const result = await ensureCheckoutSession(client({ existing: false, anonThrows: true }).auth);
  assert.equal(result.ok, false);
});

test('anonymous users are guests; real accounts are not', () => {
  assert.equal(isGuestUser({ is_anonymous: true }), true);
  assert.equal(isGuestUser({ is_anonymous: false }), false);
  assert.equal(isGuestUser(null), false);
});
