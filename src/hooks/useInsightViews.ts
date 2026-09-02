import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PrepTimeRow, WaitTimeAccuracyRow, BroadcastReach } from '@/lib/insights';

/**
 * One hook per verified view. Every view here is security_invoker, so an
 * admin's session sees everything and no edge function is needed.
 *
 * The generated types.ts predates these views, hence the `as never` casts on
 * the relation name — regenerating types removes them. Column lists are
 * explicit on purpose: `select('*')` on broadcasts would pull the fabricated
 * revenue_generated column, and a test guards against exactly that.
 */

const STALE = 60_000;

function useView<T>(view: string, select: string, order?: { column: string; ascending?: boolean }, limit?: number) {
  return useQuery({
    queryKey: ['insight-view', view, select, order?.column, order?.ascending, limit],
    queryFn: async () => {
      let query = supabase.from(view as never).select(select);
      if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
    staleTime: STALE,
  });
}

// ── Operations ────────────────────────────────────────────────────────

export function usePrepTime() {
  return useView<PrepTimeRow>(
    'v_prep_time',
    'trade_date, completed_orders, avg_prep_mins, median_prep_mins, p90_prep_mins',
    { column: 'trade_date', ascending: false },
  );
}

export function useWaitTimeAccuracy() {
  return useQuery({
    queryKey: ['insight-view', 'v_wait_time_accuracy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_wait_time_accuracy' as never)
        .select('quoted_minutes, actual_avg, actual_median, actual_p90, orders_measured, pct_slower_than_quoted')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as WaitTimeAccuracyRow | null) ?? null;
    },
    staleTime: STALE,
  });
}

// ── Demand and menu ───────────────────────────────────────────────────

export interface DemandForecastRow {
  forecast_date: string;
  day_label: string;
  trade_dow: number;
  forecast_revenue: number | null;
  forecast_orders: number | null;
  based_on_days: number | null;
  revenue_stddev: number | null;
  worst_day: number | null;
  best_day: number | null;
  confidence: string | null;
  scheduled_hours: string | null;
}

export function useDemandForecast() {
  return useView<DemandForecastRow>(
    'v_demand_forecast',
    'forecast_date, day_label, trade_dow, forecast_revenue, forecast_orders, based_on_days, revenue_stddev, worst_day, best_day, confidence, scheduled_hours',
    { column: 'forecast_date' },
  );
}

export interface MenuEngineeringRow {
  product_name: string;
  units: number | null;
  revenue: number | null;
  avg_price: number | null;
  orders_containing: number | null;
  unit_share_pct: number | null;
  revenue_share_pct: number | null;
  classification: 'star' | 'workhorse' | 'puzzle' | 'dog' | string;
  action: string | null;
}

export function useMenuEngineering() {
  return useView<MenuEngineeringRow>(
    'v_menu_engineering',
    'product_name, units, revenue, avg_price, orders_containing, unit_share_pct, revenue_share_pct, classification, action',
    { column: 'revenue', ascending: false },
  );
}

export interface ItemTrendRow {
  product_name: string;
  units_last_30: number | null;
  units_prior_30: number | null;
  revenue_last_30: number | null;
  revenue_prior_30: number | null;
  unit_change_pct: number | null;
  trend: string;
}

export function useItemTrend() {
  return useView<ItemTrendRow>(
    'v_item_trend',
    'product_name, units_last_30, units_prior_30, revenue_last_30, revenue_prior_30, unit_change_pct, trend',
    { column: 'revenue_last_30', ascending: false },
  );
}

export interface BasketAffinityRow {
  item_a: string;
  item_b: string;
  bought_together: number;
  pct_of_orders: number | null;
}

export function useBasketAffinity(limit = 10) {
  return useView<BasketAffinityRow>(
    'v_basket_affinity',
    'item_a, item_b, bought_together, pct_of_orders',
    { column: 'bought_together', ascending: false },
    limit,
  );
}

// ── Customers ─────────────────────────────────────────────────────────

export interface NewVsReturningRow {
  trade_date: string;
  orders: number;
  first_time: number;
  returning: number;
  returning_pct: number | null;
  revenue: number | null;
  avg_returning_order: number | null;
  avg_first_order: number | null;
}

export function useNewVsReturning(limit = 60) {
  return useView<NewVsReturningRow>(
    'v_new_vs_returning',
    'trade_date, orders, first_time, returning, returning_pct, revenue, avg_returning_order, avg_first_order',
    { column: 'trade_date', ascending: false },
    limit,
  );
}

export interface CustomerCohortRow {
  cohort_month: string;
  month_offset: number;
  customers: number;
  pct_of_cohort: number | null;
}

export function useCustomerCohorts() {
  return useView<CustomerCohortRow>(
    'v_customer_cohorts',
    'cohort_month, month_offset, customers, pct_of_cohort',
    { column: 'cohort_month', ascending: false },
  );
}

// ── Labour ────────────────────────────────────────────────────────────

export interface LabourCostRow {
  trade_date: string;
  revenue: number | null;
  orders: number | null;
  shifts: number | null;
  paid_hours: number | null;
  labour_cost: number | null;
  shifts_without_rate: number | null;
  labour_pct: number | null;
  revenue_per_hour: number | null;
  orders_per_hour: number | null;
  verdict: string | null;
}

export function useLabourCostDaily(limit = 30) {
  return useView<LabourCostRow>(
    'v_labour_cost_daily',
    'trade_date, revenue, orders, shifts, paid_hours, labour_cost, shifts_without_rate, labour_pct, revenue_per_hour, orders_per_hour, verdict',
    { column: 'trade_date', ascending: false },
    limit,
  );
}

export interface RosterVsDemandRow {
  trade_dow: number;
  day_name: string;
  trade_hour: number;
  historical_orders: number | null;
  historical_revenue: number | null;
  staff_scheduled: number | null;
  coverage: string | null;
}

export function useRosterVsDemand() {
  return useView<RosterVsDemandRow>(
    'v_roster_vs_demand',
    'trade_dow, day_name, trade_hour, historical_orders, historical_revenue, staff_scheduled, coverage',
    { column: 'trade_dow' },
  );
}

// ── Marketing ─────────────────────────────────────────────────────────

export interface MarketingRoiRow {
  trade_date: string;
  orders: number | null;
  revenue: number | null;
  ad_spend: number | null;
  clicks: number | null;
  blended_cost_per_order: number | null;
  blended_return_on_spend: number | null;
  verdict: string | null;
}

export function useMarketingRoiDaily(limit = 30) {
  return useView<MarketingRoiRow>(
    'v_marketing_roi_daily',
    'trade_date, orders, revenue, ad_spend, clicks, blended_cost_per_order, blended_return_on_spend, verdict',
    { column: 'trade_date', ascending: false },
    limit,
  );
}

export interface BroadcastSummaryRow {
  broadcasts_sent: number;
  total_recipients: number;
  revenue_in_windows: number | null;
  total_measured_uplift: number | null;
  avg_uplift_pct: number | null;
  sends_with_positive_uplift: number;
  unverified_claims: number;
  claimed_revenue_total: number | null;
  overstatement: number | null;
}

/** Measured uplift only. This view never exposes revenue_generated. */
export function useBroadcastSummary() {
  return useQuery({
    queryKey: ['insight-view', 'v_broadcast_summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_broadcast_summary' as never)
        .select('broadcasts_sent, total_recipients, revenue_in_windows, total_measured_uplift, avg_uplift_pct, sends_with_positive_uplift, unverified_claims, claimed_revenue_total, overstatement')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as BroadcastSummaryRow | null) ?? null;
    },
    staleTime: STALE,
  });
}

export function useBroadcastReach() {
  return useQuery({
    queryKey: ['insight-view', 'v_broadcast_reach'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_broadcast_reach' as never)
        .select('customers_total, reachable_sms, reachable_email, reachable_both, unreachable')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as BroadcastReach | null) ?? null;
    },
    staleTime: STALE,
  });
}
