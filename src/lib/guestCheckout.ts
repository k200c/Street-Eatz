/**
 * Guest checkout.
 *
 * Since 17 April 2026 every order has needed a signed-in customer: create-order
 * and payment-session both reject a request with no user. A guest reaching
 * checkout was told "Session expired. Please log in again." and most left.
 * Guest orders went from 133 in March to zero, every month.
 *
 * The fix does not touch the payment path. A guest gets a Supabase anonymous
 * session at the moment they pay: a real user id with no email or password,
 * which the customer never sees. create-order and payment-session then work
 * exactly as before, including the check that a customer can only pay for
 * their own order. The customer types their name and phone number and that is
 * all.
 *
 * Requires "Allow anonymous sign-ins" in Supabase Auth settings.
 */

export interface CheckoutAuthClient {
  getSession(): Promise<{ data: { session: unknown | null } }>;
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
export async function ensureCheckoutSession(auth: CheckoutAuthClient): Promise<CheckoutSessionResult> {
  try {
    const { data } = await auth.getSession();
    if (data.session) return { ok: true, startedGuestSession: false };

    const { data: guest, error } = await auth.signInAnonymously();
    if (error || !guest.session) {
      console.error('[GuestCheckout] anonymous sign-in failed:', error?.message ?? 'no session returned');
      return { ok: false, message: GUEST_CHECKOUT_UNAVAILABLE };
    }
    return { ok: true, startedGuestSession: true };
  } catch (error) {
    console.error('[GuestCheckout] could not establish a session:', error);
    return { ok: false, message: GUEST_CHECKOUT_UNAVAILABLE };
  }
}

/** A guest session is not an account: no profile page, no "signed in" menu. */
export function isGuestUser(user: { is_anonymous?: boolean | null } | null | undefined): boolean {
  return Boolean(user?.is_anonymous);
}
