/**
 * Staff connection safety.
 *
 * 16 October 2026: the truck Mac's login renewal was rejected at 11:04. The
 * staff screen kept showing its controls, sent nothing to the server for nearly
 * three hours, and every "Open store" tap silently went nowhere. Customers were
 * turned away while the screen gave no sign anything was wrong.
 *
 * Two rules follow, and this module holds the pure parts of both:
 *  1. A staff write must either be confirmed by the server or fail loudly
 *     within seconds. It must never hang.
 *  2. A staff screen must show when its information is stale, so a dead
 *     connection is visible instead of looking normal.
 */

export type StaffActionErrorKind = 'timeout' | 'signed_out' | 'not_saved' | 'not_confirmed';

export class StaffActionError extends Error {
  readonly kind: StaffActionErrorKind;

  constructor(message: string, kind: StaffActionErrorKind) {
    super(message);
    this.name = 'StaffActionError';
    this.kind = kind;
  }
}

/** Rejects with a StaffActionError if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StaffActionError(message, 'timeout')), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Confirm both the switch and customer ordering state; missing data is unknown. */
export async function confirmStoreToggle(
  readStatus: () => PromiseLike<{ data: unknown; error: unknown }>,
  wanted: boolean,
  timeoutMs = 10_000,
): Promise<void> {
  let result: { data: unknown; error: unknown };
  try {
    result = await withTimeout(readStatus(), timeoutMs, 'Store confirmation did not answer');
  } catch (error) {
    if (error instanceof StaffActionError && error.kind === 'timeout') throw error;
    throw new StaffActionError('Store status could not be confirmed', 'not_confirmed');
  }
  const { data, error } = result;
  const status = data as { is_open?: unknown; accepting_orders?: unknown } | null;
  if (error || !status || status.is_open !== wanted || status.accepting_orders !== wanted) {
    throw new StaffActionError('Store status could not be confirmed', 'not_confirmed');
  }
}

/** Store status older than this on a staff screen is shown as not updating. */
export const STALE_STATUS_MS = 3 * 60_000;

/**
 * True when the last successful status read is too old to trust.
 * `updatedAt` is a millisecond timestamp; 0 or missing means never read.
 */
export function isStatusStale(updatedAt: number | null | undefined, now: number, limitMs = STALE_STATUS_MS): boolean {
  if (!updatedAt) return true;
  return now - updatedAt > limitMs;
}

/** "14:02" in Irish time, for the "checked at" label. */
export function formatCheckedAt(updatedAt: number | null | undefined): string | null {
  if (!updatedAt) return null;
  return new Intl.DateTimeFormat('en-IE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Dublin',
  }).format(new Date(updatedAt));
}

/** The message staff see when a store toggle fails, by cause. */
export function storeToggleFailureMessage(error: unknown, wanted: boolean): { title: string; description: string } {
  const action = wanted ? 'opened' : 'closed';
  const title = `Store NOT ${action}`;
  if (error instanceof StaffActionError && error.kind === 'timeout') {
    return {
      title: `Store ${wanted ? 'opening' : 'closing'} NOT confirmed`,
      description: 'The server did not answer in time. The change may still complete. Reload and check the store status before tapping again. If this continues, sign out and sign back in.',
    };
  }
  if (error instanceof StaffActionError && error.kind === 'signed_out') {
    return {
      title,
      description: 'This screen has lost its login. Sign out, sign back in, then tap again.',
    };
  }
  if (error instanceof StaffActionError && error.kind === 'not_confirmed') {
    return {
      title: `Store ${wanted ? 'opening' : 'closing'} NOT confirmed`,
      description: 'The change was sent but the customer ordering status could not be confirmed. Reload this page and check before trading.',
    };
  }
  return {
    title,
    description: 'The change did not save. Reload this page and try again. If it keeps failing, call Kyle.',
  };
}
