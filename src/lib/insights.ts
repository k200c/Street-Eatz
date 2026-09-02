/**
 * Pure helpers for the analytics panels. No I/O, so every rule here is unit
 * tested and every number the UI shows can be traced to a verified view.
 *
 * Rule of the house: never compute a metric client-side that a view already
 * provides. These helpers only aggregate view rows or turn a view row into a
 * verdict. If a number you need is not in a view, add a view — do not derive
 * it here.
 */

// ── Prep time ─────────────────────────────────────────────────────────

/** Row shape of public.v_prep_time */
export interface PrepTimeRow {
  trade_date: string;
  completed_orders: number | null;
  avg_prep_mins: number | null;
  median_prep_mins: number | null;
  p90_prep_mins: number | null;
}

export interface PrepTimeSummary {
  orders: number;
  days: number;
  avg: number;
  median: number;
  p90: number;
}

/**
 * Order-weighted, not a mean of daily means. The two differ by four minutes on
 * real data (19.4 vs 23.2) and only the weighted figure matches what the
 * business reports. A day with one order must not count as much as a day
 * with forty.
 */
export function weightedPrepTime(rows: PrepTimeRow[]): PrepTimeSummary | null {
  let orders = 0;
  let avg = 0;
  let median = 0;
  let p90 = 0;
  let days = 0;

  for (const row of rows) {
    const n = Number(row.completed_orders ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (row.avg_prep_mins === null || row.median_prep_mins === null || row.p90_prep_mins === null) continue;
    orders += n;
    days += 1;
    avg += Number(row.avg_prep_mins) * n;
    median += Number(row.median_prep_mins) * n;
    p90 += Number(row.p90_prep_mins) * n;
  }

  if (orders === 0) return null;

  return {
    orders,
    days,
    avg: round1(avg / orders),
    median: round1(median / orders),
    p90: round1(p90 / orders),
  };
}

// ── Wait time accuracy ────────────────────────────────────────────────

/** Row shape of public.v_wait_time_accuracy */
export interface WaitTimeAccuracyRow {
  quoted_minutes: number | null;
  actual_avg: number | null;
  actual_median: number | null;
  actual_p90: number | null;
  orders_measured: number | null;
  pct_slower_than_quoted: number | null;
}

export type VerdictLevel = 'ok' | 'warning' | 'critical';

export interface Verdict {
  level: VerdictLevel;
  headline: string;
  detail: string;
}

/**
 * An operator's reading of the quoted-vs-actual gap. Half of customers being
 * told a number the kitchen misses is how bad reviews start, so 50%+ is
 * critical, not "a statistic".
 */
export function waitTimeVerdict(row: WaitTimeAccuracyRow | null): Verdict | null {
  if (!row || row.orders_measured === null || Number(row.orders_measured) === 0) return null;

  const quoted = Number(row.quoted_minutes ?? 0);
  const slower = Number(row.pct_slower_than_quoted ?? 0);
  const p90 = Number(row.actual_p90 ?? 0);
  const median = Number(row.actual_median ?? 0);
  const measured = Number(row.orders_measured);

  const level: VerdictLevel = slower >= 50 ? 'critical' : slower >= 30 ? 'warning' : 'ok';

  const headline =
    level === 'critical'
      ? `${slower.toFixed(0)}% of orders take longer than the ${quoted} min quoted`
      : level === 'warning'
        ? `${slower.toFixed(0)}% of orders run over the ${quoted} min quote`
        : `Quoted ${quoted} min is holding — ${slower.toFixed(0)}% run over`;

  const detail =
    `Median ${median.toFixed(1)} min, but one in ten takes ${p90.toFixed(0)} min or more ` +
    `(${measured} orders measured). ` +
    (level === 'critical'
      ? `Quote ${Math.ceil(p90 / 5) * 5} min and beat it, or fix the bottleneck. A missed quote is a bad review waiting to happen.`
      : level === 'warning'
        ? 'Worth quoting a few minutes longer during busy hours.'
        : 'No change needed.');

  return { level, headline, detail };
}

// ── Item trend caveat ─────────────────────────────────────────────────

/**
 * The last-30-days window straddles the closure (16 Aug – 3 Sep), so most items
 * read "falling" for a reason that has nothing to do with the menu. The panel
 * must say so or the owner will draw the wrong conclusion.
 */
export const CLOSURE_START = '2026-08-16';
export const CLOSURE_END = '2026-09-03';

export function windowIncludesClosure(today: Date, windowDays = 30): boolean {
  const start = new Date(today);
  start.setDate(start.getDate() - windowDays);
  const closureStart = new Date(CLOSURE_START);
  const closureEnd = new Date(CLOSURE_END);
  return start <= closureEnd && today >= closureStart;
}

export function itemTrendCaveat(today: Date): string | null {
  if (!windowIncludesClosure(today)) return null;
  return (
    'The last 30 days include the closure from 16 August to 3 September. ' +
    'Most items read "falling" or "stopped selling" for that reason alone — ' +
    'judge trends again after two full weeks of trading.'
  );
}

// ── Broadcast reach and channel defaults ──────────────────────────────

/** Row shape of public.v_broadcast_reach */
export interface BroadcastReach {
  customers_total: number;
  reachable_sms: number;
  reachable_email: number;
  reachable_both: number;
  unreachable: number;
}

export type BroadcastChannel = 'sms' | 'email';

/**
 * Default to the cheapest channel that actually reaches people. Email is
 * effectively free; SMS is metered per segment. Never pre-tick both — that is a
 * cost decision the operator should make deliberately.
 */
export function defaultChannels(reach: BroadcastReach | null): BroadcastChannel[] {
  if (!reach) return [];
  if (reach.reachable_email > 0) return ['email'];
  if (reach.reachable_sms > 0) return ['sms'];
  return [];
}

/**
 * How many people a given channel choice reaches. Both channels reach the
 * union, not the sum — a customer with both gets one message per channel but
 * is still one person.
 */
export function recipientsFor(reach: BroadcastReach | null, channels: BroadcastChannel[]): number {
  if (!reach || channels.length === 0) return 0;
  const sms = channels.includes('sms');
  const email = channels.includes('email');
  if (sms && email) return reach.reachable_sms + reach.reachable_email - reach.reachable_both;
  if (sms) return reach.reachable_sms;
  return reach.reachable_email;
}

// ── Forbidden metrics ─────────────────────────────────────────────────

/**
 * broadcasts.revenue_generated was Math.random() output — €6,706 claimed
 * against a measured uplift of −€1,234. open_rate has no meaning for SMS.
 * Neither may be rendered. A test asserts no panel selects them.
 */
export const FORBIDDEN_BROADCAST_COLUMNS = ['revenue_generated', 'open_rate'] as const;

export function selectsForbiddenColumn(selectClause: string): string | null {
  const wanted = selectClause === '*' ? [...FORBIDDEN_BROADCAST_COLUMNS] : [];
  if (wanted.length) return wanted[0];
  for (const column of FORBIDDEN_BROADCAST_COLUMNS) {
    if (new RegExp(`(^|[,\\s])${column}([,\\s]|$)`).test(selectClause)) return column;
  }
  return null;
}

// ── Formatting ────────────────────────────────────────────────────────

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `€${Number(value).toFixed(2)}`;
}
