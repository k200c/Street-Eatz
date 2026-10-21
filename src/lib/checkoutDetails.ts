/**
 * Remember the customer's checkout details on this device.
 *
 * Going back, a declined card or a cancelled Viva page all reload the page or
 * close the form, and customers had to type their name and number again.
 * Name, phone and email are kept in this browser only and prefilled next time.
 */

export const CHECKOUT_DETAILS_KEY = 'street-eatz-checkout-details';

export interface CheckoutDetails {
  name: string;
  phone: string;
  email: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');

export function loadCheckoutDetails(storage: StorageLike | undefined): CheckoutDetails {
  const empty = { name: '', phone: '', email: '' };
  try {
    const raw = storage?.getItem(CHECKOUT_DETAILS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<CheckoutDetails> | null;
    if (!parsed || typeof parsed !== 'object') return empty;
    return { name: clean(parsed.name, 100), phone: clean(parsed.phone, 30), email: clean(parsed.email, 254) };
  } catch {
    return empty;
  }
}

export function saveCheckoutDetails(storage: StorageLike | undefined, details: CheckoutDetails): void {
  try {
    storage?.setItem(CHECKOUT_DETAILS_KEY, JSON.stringify({
      name: clean(details.name, 100), phone: clean(details.phone, 30), email: clean(details.email, 254),
    }));
  } catch {
    // Private mode or full storage: remembering details is a convenience only.
  }
}

/** Email is optional; when typed it must look like one. */
export function isAcceptableEmail(email: string): boolean {
  const value = email.trim();
  return value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
