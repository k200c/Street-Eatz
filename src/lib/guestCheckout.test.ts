import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCheckoutSession, isGuestUser, isAccountUser, getAccountCartUserId, GUEST_CHECKOUT_UNAVAILABLE, type CheckoutAuthClient } from './guestCheckout.ts';

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

test('a guest can reach account sign-in and keeps a local basket', () => {
  const guest = { id: 'guest-user', is_anonymous: true };
  assert.equal(isAccountUser(guest), false);
  assert.equal(getAccountCartUserId(guest), null);
  assert.equal(getAccountCartUserId(null), null);
});

test('registered customers retain account routing and remote cart ownership', () => {
  const account = { id: 'customer-user', is_anonymous: false };
  assert.equal(isAccountUser(account), true);
  assert.equal(getAccountCartUserId(account), account.id);
  assert.equal(isAccountUser({}), true); // older persisted users omit is_anonymous
  assert.equal(isAccountUser(null), false);
});

test('a session error cannot replace a registered identity with an anonymous user', async () => {
  let anonymousCalls = 0;
  const result = await ensureCheckoutSession({
    getSession: async () => ({ data: { session: null }, error: { message: 'refresh rejected' } }),
    signInAnonymously: async () => { anonymousCalls++; throw new Error('must not run'); },
  });
  assert.equal(result.ok, false);
  assert.equal(anonymousCalls, 0);
});

test('a locked auth client fails visibly within the deadline', async () => {
  const c: CheckoutAuthClient = {
    getSession: () => new Promise(() => {}),
    signInAnonymously: async () => { throw new Error('must not run'); },
  };
  assert.deepEqual(await ensureCheckoutSession(c, 20), { ok: false, message: GUEST_CHECKOUT_UNAVAILABLE });
});

test('two callers share one anonymous session attempt and a retry is allowed after failure', async () => {
  const c = client({ anonOk: false });
  const first = ensureCheckoutSession(c.auth);
  const second = ensureCheckoutSession(c.auth);
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(c.calls(), 1);
  await ensureCheckoutSession(c.auth);
  assert.equal(c.calls(), 2);
});
