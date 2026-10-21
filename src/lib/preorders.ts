/**
 * Pre-orders on the kitchen screen.
 *
 * A paid pre-order used to be invisible on the KDS until something set
 * released_to_kitchen_at, and nothing ever did for online orders, so
 * pre-orders never appeared at all. Now:
 *  - an upcoming pre-order shows in the Pre-orders tab with its collection time;
 *  - from its kitchen release time (collection minus the lead time, 60 min by
 *    default) it joins the Cooking column with a "collect at" badge.
 * Display only: nothing here changes the order or prints anything.
 */

export interface PreorderFields {
  fulfillment_type?: string | null;
  scheduled_for?: string | null;
  kitchen_release_at?: string | null;
  released_to_kitchen_at?: string | null;
}

export const DEFAULT_PREORDER_LEAD_MINUTES = 60;

export function isScheduled(order: PreorderFields): boolean {
  return order.fulfillment_type === 'scheduled' && Boolean(order.scheduled_for);
}

/** When the order should move into Cooking. Null for ASAP orders. */
export function kitchenDueAt(order: PreorderFields, leadMinutes = DEFAULT_PREORDER_LEAD_MINUTES): Date | null {
  if (!isScheduled(order)) return null;
  if (order.kitchen_release_at) {
    const at = new Date(order.kitchen_release_at);
    if (!Number.isNaN(at.getTime())) return at;
  }
  const collect = new Date(order.scheduled_for as string);
  if (Number.isNaN(collect.getTime())) return null;
  return new Date(collect.getTime() - leadMinutes * 60_000);
}

/** True when the order belongs on the kitchen board now. */
export function isDueForKitchen(order: PreorderFields, now: Date = new Date(), leadMinutes = DEFAULT_PREORDER_LEAD_MINUTES): boolean {
  if (!isScheduled(order)) return true;
  if (order.released_to_kitchen_at) return true;
  const due = kitchenDueAt(order, leadMinutes);
  return due === null ? true : due.getTime() <= now.getTime();
}

/**
 * A pre-order whose collection time passed more than this long ago is history,
 * not work: it never surfaced before this fix and must not land on the board
 * days later. (Found: #1240, collection 9 Oct, still open.)
 */
export const STALE_PREORDER_HOURS = 12;

export function isStalePreorder(order: PreorderFields, now: Date = new Date()): boolean {
  if (!isScheduled(order)) return false;
  const collect = Date.parse(order.scheduled_for as string);
  return Number.isFinite(collect) && now.getTime() - collect > STALE_PREORDER_HOURS * 3_600_000;
}

export function splitKitchenOrders<T extends PreorderFields>(orders: T[], now: Date = new Date(), leadMinutes = DEFAULT_PREORDER_LEAD_MINUTES) {
  const kitchen: T[] = [];
  const upcoming: T[] = [];
  for (const order of orders) {
    if (isStalePreorder(order, now)) continue;
    (isDueForKitchen(order, now, leadMinutes) ? kitchen : upcoming).push(order);
  }
  upcoming.sort((a, b) => Date.parse(a.scheduled_for as string) - Date.parse(b.scheduled_for as string));
  return { kitchen, upcoming };
}

/** "12:45" (today), "Thu 12:45" (another day). Irish time. */
export function formatCollectionTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const time = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  const day = (d: Date) => new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  if (day(at) === day(now)) return time;
  const weekday = new Intl.DateTimeFormat('en-IE', { timeZone: 'Europe/Dublin', weekday: 'short' }).format(at);
  return `${weekday} ${time}`;
}
