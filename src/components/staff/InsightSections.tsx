import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import {
  Clock3,
  TrendingUp,
  TrendingDown,
  Star,
  Users,
  ShoppingBag,
  CalendarDays,
  Megaphone,
  Minus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { InsightPanel, VerdictBanner, StatTile } from './InsightPanel';
import {
  usePrepTime,
  useWaitTimeAccuracy,
  useDemandForecast,
  useMenuEngineering,
  useItemTrend,
  useNewVsReturning,
  useCustomerCohorts,
  useBasketAffinity,
  useLabourCostDaily,
  useRosterVsDemand,
  useMarketingRoiDaily,
  useBroadcastSummary,
} from '@/hooks/useInsightViews';
import { weightedPrepTime, waitTimeVerdict, itemTrendCaveat, formatEuro } from '@/lib/insights';

/**
 * Each section reads exactly one or two verified views and renders them with
 * loading, error, empty and populated states. Nothing here aggregates beyond
 * what src/lib/insights.ts does, and that file is unit tested.
 */

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`;

// ── Operations & service speed ────────────────────────────────────────

export function ServiceSpeedPanel() {
  const prep = usePrepTime();
  const accuracy = useWaitTimeAccuracy();

  const summary = useMemo(() => weightedPrepTime(prep.data ?? []), [prep.data]);
  const verdict = useMemo(() => waitTimeVerdict(accuracy.data ?? null), [accuracy.data]);

  return (
    <InsightPanel
      title="Kitchen speed vs the quoted wait"
      description="Actual preparation time from order to completion, against what customers were told"
      icon={Clock3}
      isLoading={prep.isLoading || accuracy.isLoading}
      error={prep.error || accuracy.error}
      isEmpty={!summary}
      emptyText="No completed orders with timing data yet. This fills in from the first paid, completed order."
      onRetry={() => { void prep.refetch(); void accuracy.refetch(); }}
      asOf={prep.dataUpdatedAt ? new Date(prep.dataUpdatedAt) : null}
    >
      {verdict && <VerdictBanner {...verdict} />}
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Average prep" value={`${summary.avg.toFixed(1)} min`} note={`${summary.orders} orders, ${summary.days} trading days`} />
          <StatTile label="Median" value={`${summary.median.toFixed(1)} min`} note="half of orders are faster" />
          <StatTile label="P90" value={`${summary.p90.toFixed(1)} min`} note="1 in 10 takes this or longer" tone={summary.p90 > (accuracy.data?.quoted_minutes ?? 20) * 1.5 ? 'warning' : 'normal'} />
          <StatTile
            label="Quoted wait"
            value={accuracy.data?.quoted_minutes ? `${accuracy.data.quoted_minutes} min` : '—'}
            note={accuracy.data ? `${pct(accuracy.data.pct_slower_than_quoted)} of orders run over` : 'not measured'}
            tone={verdict?.level === 'critical' ? 'warning' : 'normal'}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Average is weighted by orders per day, so a quiet day does not count as much as a busy one.
      </p>
    </InsightPanel>
  );
}

// ── Demand forecast ───────────────────────────────────────────────────

export function DemandForecastPanel() {
  const forecast = useDemandForecast();
  const rows = forecast.data ?? [];
  const tradingRows = rows.filter((row) => row.scheduled_hours && row.scheduled_hours !== 'Closed');

  return (
    <InsightPanel
      title="Next 14 days"
      description="Expected revenue by weekday, from the same weekday's recent history"
      icon={CalendarDays}
      isLoading={forecast.isLoading}
      error={forecast.error}
      isEmpty={rows.length === 0}
      emptyText="No forecast yet — it needs at least one trading day per weekday to work from."
      onRetry={() => void forecast.refetch()}
      asOf={forecast.dataUpdatedAt ? new Date(forecast.dataUpdatedAt) : null}
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="day_label" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => `€${v}`} />
            <Tooltip
              formatter={(value: number, _name, item) => [
                `${formatEuro(value)} · ${item.payload.confidence ?? '?'} confidence`,
                item.payload.scheduled_hours === 'Closed' ? 'Closed' : 'Forecast',
              ]}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            />
            <Bar dataKey="forecast_revenue" radius={[4, 4, 0, 0]}>
              {rows.map((row) => (
                <Cell
                  key={row.forecast_date}
                  fill={row.scheduled_hours === 'Closed' ? 'hsl(var(--muted))' : row.confidence === 'good' ? 'hsl(var(--primary))' : 'hsl(25 80% 35%)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tradingRows.slice(0, 4).map((row) => (
          <StatTile
            key={row.forecast_date}
            label={row.day_label}
            value={formatEuro(row.forecast_revenue)}
            note={`${row.scheduled_hours} · ${row.confidence ?? '?'} confidence (${row.based_on_days ?? 0} days)`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Grey bars are closed days. Confidence reflects how many past days the weekday is based on.
      </p>
    </InsightPanel>
  );
}

// ── Menu engineering ──────────────────────────────────────────────────

const CLASS_TONE: Record<string, string> = {
  star: 'bg-green-500/20 text-green-300 border-green-500/40',
  workhorse: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  puzzle: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  dog: 'bg-red-500/20 text-red-300 border-red-500/40',
};

export function MenuEngineeringPanel() {
  const menu = useMenuEngineering();
  const rows = useMemo(() => menu.data ?? [], [menu.data]);

  const byClass = useMemo(() => {
    const groups: Record<string, { items: number; revenue: number }> = {};
    for (const row of rows) {
      const key = row.classification ?? 'unclassified';
      groups[key] = groups[key] ?? { items: 0, revenue: 0 };
      groups[key].items += 1;
      groups[key].revenue += Number(row.revenue ?? 0);
    }
    return groups;
  }, [rows]);

  return (
    <InsightPanel
      title="Menu engineering"
      description="Every item classed by how often it sells and how much it earns"
      icon={Star}
      isLoading={menu.isLoading}
      error={menu.error}
      isEmpty={rows.length === 0}
      emptyText="No paid item sales to classify yet."
      onRetry={() => void menu.refetch()}
      asOf={menu.dataUpdatedAt ? new Date(menu.dataUpdatedAt) : null}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(['star', 'workhorse', 'puzzle', 'dog'] as const).map((key) => (
          <StatTile
            key={key}
            label={key === 'star' ? 'Stars' : key === 'workhorse' ? 'Workhorses' : key === 'puzzle' ? 'Puzzles' : 'Dogs'}
            value={`${byClass[key]?.items ?? 0} items`}
            note={`${formatEuro(byClass[key]?.revenue ?? 0)} revenue`}
            tone={key === 'star' ? 'good' : key === 'dog' ? 'warning' : 'normal'}
          />
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/30 text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Units</th>
              <th className="p-2 text-right">Revenue</th>
              <th className="p-2 text-right">Share</th>
              <th className="p-2 text-left">Class</th>
              <th className="p-2 text-left">What to do</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((row) => (
              <tr key={row.product_name} className="border-t border-border align-top">
                <td className="p-2 font-medium">{row.product_name}</td>
                <td className="p-2 text-right tabular-nums">{row.units ?? 0}</td>
                <td className="p-2 text-right tabular-nums">{formatEuro(row.revenue)}</td>
                <td className="p-2 text-right tabular-nums">{pct(row.revenue_share_pct)}</td>
                <td className="p-2">
                  <Badge variant="outline" className={`capitalize ${CLASS_TONE[row.classification] ?? ''}`}>{row.classification}</Badge>
                </td>
                <td className="p-2 text-xs text-muted-foreground">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 20 && <p className="text-xs text-muted-foreground">Showing the top 20 of {rows.length} by revenue.</p>}
    </InsightPanel>
  );
}

// ── Item trend ────────────────────────────────────────────────────────

const TREND_ICON: Record<string, typeof TrendingUp> = { rising: TrendingUp, falling: TrendingDown };

export function ItemTrendPanel() {
  const trend = useItemTrend();
  const rows = trend.data ?? [];
  const caveat = useMemo(() => itemTrendCaveat(new Date()), []);

  return (
    <InsightPanel
      title="Item trends"
      description="Last 30 days against the 30 before"
      icon={TrendingUp}
      isLoading={trend.isLoading}
      error={trend.error}
      isEmpty={rows.length === 0}
      emptyText="Not enough history to compare two 30-day windows yet."
      onRetry={() => void trend.refetch()}
      asOf={trend.dataUpdatedAt ? new Date(trend.dataUpdatedAt) : null}
      caveat={caveat}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.slice(0, 16).map((row) => {
          const Icon = TREND_ICON[row.trend] ?? Minus;
          const tone = row.trend === 'rising' ? 'text-green-400' : row.trend === 'falling' || row.trend === 'stopped selling' ? 'text-red-400' : 'text-muted-foreground';
          return (
            <div key={row.product_name} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/20 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.product_name}</p>
                <p className="text-xs text-muted-foreground">{row.units_last_30 ?? 0} vs {row.units_prior_30 ?? 0} units</p>
              </div>
              <div className={`flex shrink-0 items-center gap-1 text-sm ${tone}`}>
                <Icon className="h-4 w-4" />
                <span className="capitalize">{row.trend}</span>
                {row.unit_change_pct !== null && <span className="tabular-nums">({row.unit_change_pct > 0 ? '+' : ''}{Number(row.unit_change_pct).toFixed(0)}%)</span>}
              </div>
            </div>
          );
        })}
      </div>
    </InsightPanel>
  );
}

// ── Customers ─────────────────────────────────────────────────────────

export function CustomersPanel() {
  const nvr = useNewVsReturning(60);
  const cohorts = useCustomerCohorts();
  const basket = useBasketAffinity(8);

  const totals = useMemo(() => {
    const rows = nvr.data ?? [];
    const orders = rows.reduce((sum, row) => sum + Number(row.orders ?? 0), 0);
    const returning = rows.reduce((sum, row) => sum + Number(row.returning ?? 0), 0);
    return { orders, returning, pct: orders > 0 ? (returning / orders) * 100 : null };
  }, [nvr.data]);

  const isLoading = nvr.isLoading || cohorts.isLoading || basket.isLoading;
  const error = nvr.error || cohorts.error || basket.error;
  const isEmpty = (nvr.data?.length ?? 0) === 0 && (basket.data?.length ?? 0) === 0;

  return (
    <InsightPanel
      title="Customers"
      description="Repeat rate, retention by month joined, and what sells together"
      icon={Users}
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyText="No customer history yet."
      onRetry={() => { void nvr.refetch(); void cohorts.refetch(); void basket.refetch(); }}
      asOf={nvr.dataUpdatedAt ? new Date(nvr.dataUpdatedAt) : null}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Repeat customers" value={totals.pct === null ? '—' : `${totals.pct.toFixed(1)}%`} note={`${totals.returning} of ${totals.orders} recent orders`} tone="good" />
        <StatTile label="Best pairing" value={basket.data?.[0] ? `${basket.data[0].bought_together} orders` : '—'} note={basket.data?.[0] ? `${basket.data[0].item_a} + ${basket.data[0].item_b}` : 'no pairs yet'} />
        <StatTile label="Cohorts tracked" value={String(new Set((cohorts.data ?? []).map((row) => row.cohort_month)).size)} note="months with first-time customers" />
      </div>

      {(basket.data?.length ?? 0) > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium"><ShoppingBag className="h-4 w-4 text-primary" />Bought together — the upsell prompts</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {basket.data!.map((row) => (
              <li key={`${row.item_a}-${row.item_b}`} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-2 text-sm">
                <span className="truncate">{row.item_a} <span className="text-muted-foreground">+</span> {row.item_b}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{row.bought_together} · {pct(row.pct_of_orders)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InsightPanel>
  );
}

// ── Labour ────────────────────────────────────────────────────────────

export function LabourPanel() {
  const labour = useLabourCostDaily(30);
  const roster = useRosterVsDemand();

  const daysWithShifts = (labour.data ?? []).filter((row) => Number(row.shifts ?? 0) > 0);
  const under = (roster.data ?? []).filter((row) => row.coverage && /under|short|gap/i.test(row.coverage));

  return (
    <InsightPanel
      title="Labour"
      description="Labour cost against revenue, and scheduled cover against real demand"
      icon={Users}
      isLoading={labour.isLoading || roster.isLoading}
      error={labour.error || roster.error}
      isEmpty={daysWithShifts.length === 0 && (roster.data?.length ?? 0) === 0}
      emptyText="No shifts have been rostered yet, so there is no labour cost to show. Add shifts with an hourly rate under Operations → Roster and this fills in — nothing is estimated."
      onRetry={() => { void labour.refetch(); void roster.refetch(); }}
      asOf={labour.dataUpdatedAt ? new Date(labour.dataUpdatedAt) : null}
    >
      {daysWithShifts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          Demand by hour is known from orders; cost is not, because no shifts carry an hourly rate yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {daysWithShifts.slice(0, 4).map((row) => (
            <StatTile key={row.trade_date} label={row.trade_date} value={pct(row.labour_pct)} note={`${formatEuro(row.revenue_per_hour)}/hr · ${row.verdict ?? ''}`} tone={Number(row.labour_pct ?? 0) > 35 ? 'warning' : 'normal'} />
          ))}
        </div>
      )}
      {under.length > 0 && (
        <p className="text-xs text-amber-300">{under.length} weekday-hours where scheduled cover is below historical demand.</p>
      )}
    </InsightPanel>
  );
}

// ── Marketing ROI ─────────────────────────────────────────────────────

export function MarketingRoiPanel() {
  const roi = useMarketingRoiDaily(30);
  const summary = useBroadcastSummary();

  const spendDays = (roi.data ?? []).filter((row) => Number(row.ad_spend ?? 0) > 0);
  const s = summary.data;

  return (
    <InsightPanel
      title="Marketing return"
      description="Blended, not attributed — revenue on days with spend, not revenue caused by spend"
      icon={Megaphone}
      isLoading={roi.isLoading || summary.isLoading}
      error={roi.error || summary.error}
      isEmpty={!s && spendDays.length === 0}
      emptyText="No ad spend recorded and no broadcasts measured yet."
      onRetry={() => { void roi.refetch(); void summary.refetch(); }}
      asOf={summary.dataUpdatedAt ? new Date(summary.dataUpdatedAt) : null}
    >
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Broadcasts sent" value={String(s.broadcasts_sent)} note={`${s.total_recipients} recipients in total`} />
            <StatTile label="Measured uplift" value={formatEuro(s.total_measured_uplift)} note="vs the same window with no send" tone={Number(s.total_measured_uplift ?? 0) < 0 ? 'warning' : 'good'} />
            <StatTile label="Average uplift" value={pct(s.avg_uplift_pct)} note={`${s.sends_with_positive_uplift} of ${s.broadcasts_sent} sends went up`} tone={Number(s.avg_uplift_pct ?? 0) < 0 ? 'warning' : 'normal'} />
            <StatTile label="Unverified claims" value={String(s.unverified_claims)} note="legacy records with no evidence" tone={s.unverified_claims > 0 ? 'warning' : 'normal'} />
          </div>
          {Number(s.overstatement ?? 0) > 0 && (
            <VerdictBanner
              level="warning"
              headline={`Earlier reports overstated broadcast revenue by ${formatEuro(s.overstatement)}`}
              detail={`${formatEuro(s.claimed_revenue_total)} was claimed across ${s.unverified_claims} sends with no evidence behind it. The measured figure above is what actually happened, and it is the only one shown anywhere in this dashboard.`}
            />
          )}
        </>
      )}
      {spendDays.length === 0 ? (
        <p className="text-xs text-muted-foreground">No ad spend has been recorded, so cost per order and return on spend cannot be shown.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {spendDays.slice(0, 4).map((row) => (
            <StatTile key={row.trade_date} label={row.trade_date} value={row.blended_return_on_spend === null ? '—' : `${Number(row.blended_return_on_spend).toFixed(1)}×`} note={`${formatEuro(row.ad_spend)} spend · ${row.verdict ?? ''}`} />
          ))}
        </div>
      )}
    </InsightPanel>
  );
}
