/**
 * Guest checkout.
 *
 * Since 17 April 2026 every order has needed a signed-in customer: create-order
 * and payment-session both reject a request with no user. A guest reaching
 * checkout was told "Session expired. Please log in again." and most left.
 * Guest orders went from 133 in March to zero, every month.
 *
 * A guest gets a Supabase anonymous session at the moment they pay: a real
 * user id with no account signup. The current browser checkout inserts through
 * ownership-scoped orders/order_items policies, then calls payment-session,
 * which checks ownership. Card checkout still requires name, phone and email.
 *
 * Requires "Allow anonymous sign-ins" in Supabase Auth settings.
 */

import { withTimeout } from './staffConnection.ts';

export interface CheckoutAuthClient {
  getSession(): Promise<{ data: { session: unknown | null }; error?: { message?: string } | null }>;
  signInAnonymously(): Promise<{ data: { session: unknown | null }; error: { message?: string } | null }>;
}

// A flat shape rather than a union: this app compiles without strictNullChecks,
// where `if (!result.ok)` does not narrow a discriminated union.
export interface CheckoutSessionResult {
  ok: boolean;
  startedGuestSession?: boolean;
  message?: string;
}

export const GUEST_CHECKOUT_UNAVAILABLE =
  "We couldn't start your order. Please refresh the page and try again.";

/**
 * Makes sure there is a session to place the order under. A signed-in customer
 * keeps their own; anyone else gets a guest session. Never asks anyone to log in.
 */
const pendingSessions = new WeakMap<CheckoutAuthClient, Promise<CheckoutSessionResult>>();

export function ensureCheckoutSession(auth: CheckoutAuthClient, timeoutMs = 10_000): Promise<CheckoutSessionResult> {
  const pending = pendingSessions.get(auth);
  if (pending) return pending;

  const establish = async (): Promise<CheckoutSessionResult> => {
    const { data, error: sessionError } = await auth.getSession();
    // A failed refresh must not silently replace an account with a new guest.
    if (sessionError) return { ok: false, message: GUEST_CHECKOUT_UNAVAILABLE };
    if (data.session) return { ok: true, startedGuestSession: false };

    const { data: guest, error } = await auth.signInAnonymously();
    if (error || !guest.session) {
      return { ok: false, message: GUEST_CHECKOUT_UNAVAILABLE };
    }
    return { ok: true, startedGuestSession: true };
  };

  const attempt = withTimeout(establish(), timeoutMs, 'Checkout login did not answer')
    .catch((): CheckoutSessionResult => ({ ok: false, message: GUEST_CHECKOUT_UNAVAILABLE }))
    .finally(() => pendingSessions.delete(auth));
  pendingSessions.set(auth, attempt);
  return attempt;
}

/** A guest session is not an account: no profile page, no "signed in" menu. */
export function isGuestUser(user: { is_anonymous?: boolean | null } | null | undefined): boolean {
  return Boolean(user?.is_anonymous);
}

export function isAccountUser(user: { is_anonymous?: boolean | null } | null | undefined): boolean {
  return Boolean(user) && !isGuestUser(user);
}

/** Guest checkout authentication must not migrate or reload the local basket. */
export function getAccountCartUserId(user: { id: string; is_anonymous?: boolean | null } | null | undefined): string | null {
  return isAccountUser(user) ? user!.id : null;
}
