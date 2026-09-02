import test from 'node:test';
import assert from 'node:assert/strict';
import {
  weightedPrepTime,
  waitTimeVerdict,
  itemTrendCaveat,
  windowIncludesClosure,
  defaultChannels,
  recipientsFor,
  selectsForbiddenColumn,
  formatEuro,
  type BroadcastReach,
} from './insights.ts';

// ── Prep time ─────────────────────────────────────────────────────────

test('prep time is order-weighted, not a mean of daily means', () => {
  // Two days: one order at 40 min, forty orders at 10 min.
  // Mean of daily means = 25. Weighted = (40 + 400) / 41 ≈ 10.7.
  const summary = weightedPrepTime([
    { trade_date: '2026-08-01', completed_orders: 1, avg_prep_mins: 40, median_prep_mins: 40, p90_prep_mins: 40 },
    { trade_date: '2026-08-02', completed_orders: 40, avg_prep_mins: 10, median_prep_mins: 10, p90_prep_mins: 12 },
  ]);
  assert.ok(summary);
  assert.equal(summary.orders, 41);
  assert.equal(summary.days, 2);
  assert.equal(summary.avg, 10.7);
});

test('prep time reproduces the verified production figure', () => {
  // The shape of the real data: 398 orders over 71 days weighted to 19.4.
  // Two rows that produce the same weighted answer.
  const summary = weightedPrepTime([
    { trade_date: '2026-06-01', completed_orders: 200, avg_prep_mins: 17.4, median_prep_mins: 15, p90_prep_mins: 28 },
    { trade_date: '2026-06-02', completed_orders: 198, avg_prep_mins: 21.42, median_prep_mins: 17, p90_prep_mins: 32.2 },
  ]);
  assert.ok(summary);
  assert.equal(summary.avg, 19.4);
});

test('prep time is null with no completed orders — never a placeholder', () => {
  assert.equal(weightedPrepTime([]), null);
  assert.equal(
    weightedPrepTime([{ trade_date: '2026-08-20', completed_orders: 0, avg_prep_mins: null, median_prep_mins: null, p90_prep_mins: null }]),
    null,
  );
});

// ── Wait time accuracy ────────────────────────────────────────────────

test('the live wait-time figures produce a critical verdict', () => {
  // Exactly what v_wait_time_accuracy returned on 2 Sept.
  const verdict = waitTimeVerdict({
    quoted_minutes: 20,
    actual_avg: 23.2,
    actual_median: 20.3,
    actual_p90: 35.4,
    orders_measured: 136,
    pct_slower_than_quoted: 52.2,
  });
  assert.ok(verdict);
  assert.equal(verdict.level, 'critical');
  assert.match(verdict.headline, /52% of orders take longer than the 20 min quoted/);
  assert.match(verdict.detail, /136 orders measured/);
  assert.match(verdict.detail, /Quote 40 min/);
});

test('a quote the kitchen hits is ok, not a warning', () => {
  const verdict = waitTimeVerdict({
    quoted_minutes: 25, actual_avg: 18, actual_median: 17, actual_p90: 24, orders_measured: 90, pct_slower_than_quoted: 8,
  });
  assert.ok(verdict);
  assert.equal(verdict.level, 'ok');
});

test('no measured orders means no verdict', () => {
  assert.equal(waitTimeVerdict(null), null);
  assert.equal(waitTimeVerdict({ quoted_minutes: 20, actual_avg: null, actual_median: null, actual_p90: null, orders_measured: 0, pct_slower_than_quoted: null }), null);
});

// ── Item trend caveat ─────────────────────────────────────────────────

test('the closure caveat shows while the 30-day window overlaps 16 Aug – 3 Sep', () => {
  assert.equal(windowIncludesClosure(new Date('2026-09-02')), true);
  assert.equal(windowIncludesClosure(new Date('2026-09-20')), true);
  assert.equal(windowIncludesClosure(new Date('2026-10-10')), false);
  assert.match(itemTrendCaveat(new Date('2026-09-02')) ?? '', /closure/);
  assert.equal(itemTrendCaveat(new Date('2026-10-10')), null);
});

// ── Broadcast reach ───────────────────────────────────────────────────

const LIVE_REACH: BroadcastReach = {
  customers_total: 185, reachable_sms: 185, reachable_email: 0, reachable_both: 0, unreachable: 0,
};

test('email-only shows zero recipients against the live reach', () => {
  assert.equal(recipientsFor(LIVE_REACH, ['email']), 0);
});

test('sms reaches everyone; both channels count people, not messages', () => {
  assert.equal(recipientsFor(LIVE_REACH, ['sms']), 185);
  assert.equal(recipientsFor(LIVE_REACH, ['sms', 'email']), 185);
  const overlap: BroadcastReach = { customers_total: 100, reachable_sms: 80, reachable_email: 50, reachable_both: 30, unreachable: 0 };
  assert.equal(recipientsFor(overlap, ['sms', 'email']), 100);
});

test('defaults to the cheapest channel that reaches people, never both', () => {
  // Live data: no email reach, so SMS is the only channel that reaches anyone.
  assert.deepEqual(defaultChannels(LIVE_REACH), ['sms']);
  // If email reached anyone it would win — it is free.
  assert.deepEqual(defaultChannels({ ...LIVE_REACH, reachable_email: 12 }), ['email']);
  assert.deepEqual(defaultChannels(null), []);
  for (const reach of [LIVE_REACH, { ...LIVE_REACH, reachable_email: 12 }]) {
    assert.ok(defaultChannels(reach).length <= 1, 'must never pre-tick both');
  }
});

// ── Forbidden metrics ─────────────────────────────────────────────────

test('revenue_generated and open_rate are caught in a select clause', () => {
  assert.equal(selectsForbiddenColumn('id, title, revenue_generated'), 'revenue_generated');
  assert.equal(selectsForbiddenColumn('open_rate, title'), 'open_rate');
  assert.equal(selectsForbiddenColumn('*'), 'revenue_generated');
  assert.equal(selectsForbiddenColumn('id, title, message, channels, broadcast_type'), null);
});

test('formatEuro never fabricates a number', () => {
  assert.equal(formatEuro(null), '—');
  assert.equal(formatEuro(undefined), '—');
  assert.equal(formatEuro(190.4), '€190.40');
});
