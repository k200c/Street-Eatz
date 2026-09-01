/**
 * Store status — one answer, from the server.
 *
 * A browse test on 1 September found the homepage taking orders with a 20-minute
 * wait, /details saying "Closed", and admin saying "STORE OPEN", all at once.
 * The database was never ambiguous: is_store_open was false AND Tuesday had
 * open: null. Three components each computed their own answer and disagreed.
 *
 * The fix is that nothing computes this any more. public.get_store_status()
 * decides, and this module only normalises its payload into a view model.
 *
 * Do NOT reintroduce a derivation from is_store_open or opening_hours here or
 * in any component. If a new surface needs store status, call useStoreStatus.
 */

/** Shape returned by public.get_store_status(). */
export interface StoreStatusPayload {
  is_open?: boolean | null;
  accepting_orders?: boolean | null;
  reason?: string | null;
  message?: string | null;
  wait_time?: string | null;
  opens_at?: string | null;
  today?: string | null;
  today_label?: string | null;
  local_time?: string | null;
  checked_at?: string | null;
}

export interface StoreStatus {
  /** False when the RPC could not be read. Everything else fails closed. */
  isStatusAvailable: boolean;
  isStoreOpen: boolean;
  /** The only thing an order button may be gated on. */
  acceptingOrders: boolean;
  /** Null unless genuinely open. Never substitute a default. */
  waitTime: string | null;
  message: string;
  reason: string | null;
  opensAt: string | null;
  today: string | null;
  todayLabel: string | null;
  localTime: string | null;
  checkedAt: string | null;
  devModeEnabled: boolean;
}

const CLOSED_MESSAGE = 'Closed';
const UNAVAILABLE_MESSAGE = 'Status unavailable';

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * @param payload         result of get_store_status(), or null if unreadable
 * @param devModeRequested local bypass flag from the browser
 * @param allowDevMode     whether this build honours it (development only)
 */
export function normaliseStoreStatus(
  payload: StoreStatusPayload | null | undefined,
  devModeRequested = false,
  allowDevMode = false,
): StoreStatus {
  const devModeEnabled = allowDevMode && devModeRequested;
  const isStatusAvailable = Boolean(payload);

  // No answer from the server means closed. Never guess the store open.
  if (!payload) {
    return {
      isStatusAvailable: false,
      isStoreOpen: devModeEnabled,
      acceptingOrders: devModeEnabled,
      waitTime: null,
      message: devModeEnabled ? 'Developer bypass' : UNAVAILABLE_MESSAGE,
      reason: devModeEnabled ? 'dev_bypass' : 'status_unavailable',
      opensAt: null,
      today: null,
      todayLabel: null,
      localTime: null,
      checkedAt: null,
      devModeEnabled,
    };
  }

  const serverOpen = payload.is_open === true;
  const isStoreOpen = devModeEnabled ? true : serverOpen;
  const acceptingOrders = devModeEnabled ? true : payload.accepting_orders === true;

  // A wait time while closed is exactly the contradiction this replaces, so it
  // is dropped here even if the server ever sends one.
  const waitTime = serverOpen ? cleanString(payload.wait_time) : null;

  return {
    isStatusAvailable,
    isStoreOpen,
    acceptingOrders,
    waitTime,
    message: cleanString(payload.message) ?? (isStoreOpen ? 'Open' : CLOSED_MESSAGE),
    reason: cleanString(payload.reason),
    opensAt: cleanString(payload.opens_at),
    today: cleanString(payload.today),
    todayLabel: cleanString(payload.today_label),
    localTime: cleanString(payload.local_time),
    checkedAt: cleanString(payload.checked_at),
    devModeEnabled,
  };
}
