import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Compass,
  DollarSign,
  Flame,
  Lightbulb,
  Paperclip,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useOrdersHeatmap, useItemLeaderboard, useRevenueKPIs, useOperationalInsights } from '@/hooks/useAnalyticsData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { CompetitorIntelligence } from '@/components/staff/CompetitorIntelligence';
import { useFoodOSModules } from '@/hooks/useFoodOSModules';
import {
  ServiceSpeedPanel,
  DemandForecastPanel,
  MenuEngineeringPanel,
  ItemTrendPanel,
  CustomersPanel,
  LabourPanel,
  MarketingRoiPanel,
} from '@/components/staff/InsightSections';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const insightRoadmap = [
  {
    status: 'Live now',
    tone: 'border-green-500/30 bg-green-500/5 text-green-300',
    items: [
      'Revenue, paid orders, average order value and week-on-week movement',
      'Daily trading, payment split and web, QR, app, voice and staff channel mix',
      'Best-selling items, units, revenue, meal periods and modifier attach rate',
      'Peak days and hours, average, median and P90 preparation time',
      'Customer count, returning-customer rate and reporting data health',
    ],
  },
  {
    status: 'Next FoodOS data modules',
    tone: 'border-primary/30 bg-primary/5 text-primary',
    items: [
      'Food cost, gross margin and contribution margin by item and category',
      'Stock depletion, low-stock risk, waste, spoilage and stock variance',
      'Labour cost percentage, sales per labour hour and roster efficiency',
      'Cash reconciliation, tips, refunds, discounts and payment exceptions',
      'Loyalty activation, repeat frequency, customer cohorts and churn risk',
      'Scheduled-order demand, cancellations, capacity and kitchen-release load',
      'HACCP completion, food-safety exceptions and supplier performance',
    ],
  },
  {
    status: 'Integration intelligence',
    tone: 'border-violet-500/30 bg-violet-500/5 text-violet-300',
    items: [
      'Google review rating, sentiment, response speed and service recovery',
      'Google and Meta ad spend, revenue attribution, ROAS and acquisition cost',
      'Competitor pricing, menu, offer, rating and review-trend movement',
      'Demand forecasts using weather, local events and historical trading',
      'Supplier price variance, order reliability and purchasing opportunities',
      'Daily exception alerts plus automated owner morning and end-of-day reports',
    ],
  },
] as const;

function SectionHeading({ icon: Icon, title, description }: {
  icon: typeof BarChart3;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 text-left">
      <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs font-normal text-muted-foreground sm:text-sm">{description}</span>
      </span>
    </div>
  );
}

// Heatmap color scale
function getHeatColor(value: number, max: number): string {
  if (max === 0) return 'hsl(var(--secondary))';
  const intensity = value / max;
  if (intensity === 0) return 'hsl(var(--secondary))';
  if (intensity < 0.25) return 'hsl(25 70% 20%)';
  if (intensity < 0.5) return 'hsl(25 80% 35%)';
  if (intensity < 0.75) return 'hsl(25 90% 45%)';
  return 'hsl(25 100% 50%)';
}

function HeatmapChart() {
  const { data: heatmapData, isLoading, isError, refetch } = useOrdersHeatmap();

  if (isLoading) {
    return <div className="h-[200px] bg-secondary/30 rounded-lg animate-pulse" />;
  }

  if (isError) {
    return <AnalyticsError onRetry={() => void refetch()} />;
  }

  const maxCount = Math.max(...(heatmapData?.map(d => d.count) || [0]), 1);

  // Group by day for display
  const gridData = DAYS.map((dayName, dayIndex) => {
    const dayData = heatmapData?.filter(d => d.day === dayIndex) || [];
    return {
      day: dayName,
      hours: HOURS.map(hour => {
        const cell = dayData.find(d => d.hour === hour);
        return cell?.count || 0;
      }),
    };
  });

  // Find peak hours (focus on business hours 10-22)
  const businessHours = heatmapData?.filter(d => d.hour >= 10 && d.hour <= 22) || [];
  const peakHour = businessHours.reduce((max, curr) => curr.count > max.count ? curr : max, { hour: 12, day: 0, count: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">Peak Time:</span>
        <span className="font-bold text-primary">
          {DAYS[peakHour.day]} @ {peakHour.hour}:00
        </span>
        <span className="text-muted-foreground">({peakHour.count} orders)</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex mb-1">
            <div className="w-12" />
            {[10, 12, 14, 16, 18, 20, 22].map(hour => (
              <div key={hour} className="flex-1 text-center text-xs text-muted-foreground">
                {hour}:00
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="space-y-1">
            {gridData.map((row) => (
              <div key={row.day} className="flex items-center gap-1">
                <div className="w-12 text-xs text-muted-foreground font-medium">{row.day}</div>
                <div className="flex-1 flex gap-0.5">
                  {row.hours.slice(10, 23).map((count, hourIdx) => (
                    <div
                      key={hourIdx}
                      className="flex-1 h-6 rounded-sm transition-colors cursor-pointer hover:ring-1 hover:ring-primary"
                      style={{ backgroundColor: getHeatColor(count, maxCount) }}
                      title={`${row.day} ${10 + hourIdx}:00 - ${count} orders`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-xs text-muted-foreground">Less</span>
            <div className="flex gap-0.5">
              {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-sm"
                  style={{ backgroundColor: getHeatColor(intensity * maxCount, maxCount) }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemLeaderboardChart() {
  const [mealPeriod, setMealPeriod] = useState<'all' | 'lunch' | 'dinner'>('all');
  const { data: leaderboard, isLoading, isError, refetch } = useItemLeaderboard(mealPeriod);

  if (isLoading) {
    return <div className="h-[300px] bg-secondary/30 rounded-lg animate-pulse" />;
  }

  if (isError) {
    return <AnalyticsError onRetry={() => void refetch()} />;
  }

  const chartConfig = {
    count: {
      label: 'Orders',
      color: 'hsl(var(--primary))',
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['all', 'lunch', 'dinner'] as const).map((period) => (
          <Button
            key={period}
            variant={mealPeriod === period ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMealPeriod(period)}
          >
            {period === 'all' ? 'All Day' : period.charAt(0).toUpperCase() + period.slice(1)}
          </Button>
        ))}
      </div>

      {leaderboard?.length === 0 ? (
        <div className="h-[250px] flex items-center justify-center text-muted-foreground">
          No order data available
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leaderboard} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={120}
                tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-lg bg-popover p-3 shadow-lg border border-border">
                        <p className="font-semibold">{data.name}</p>
                        <p className="text-sm text-primary">{data.count} orders</p>
                        <p className="text-sm text-muted-foreground">€{data.revenue.toFixed(0)} revenue</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {leaderboard?.map((_, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={index === 0 ? 'hsl(var(--primary))' : `hsl(var(--primary) / ${1 - index * 0.08})`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
    </div>
  );
}

function AnalyticsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-40 rounded-lg border border-destructive/30 bg-destructive/10 p-5 flex flex-col items-center justify-center text-center gap-3">
      <AlertTriangle className="w-7 h-7 text-destructive" />
      <div>
        <p className="font-semibold">Analytics data is unavailable</p>
        <p className="text-sm text-muted-foreground">Check the reporting database views and your staff access, then try again.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" /> Retry
      </Button>
    </div>
  );
}

function formatChannel(channel: string) {
  return channel.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AnalyticsDashboard() {
  const { data: kpis, isLoading: kpisLoading, isError: kpisError, refetch: refetchKpis } = useRevenueKPIs();
  const {
    data: operations,
    isLoading: operationsLoading,
    isError: operationsError,
    refetch: refetchOperations,
  } = useOperationalInsights();
  const { data: modules = [] } = useFoodOSModules();

  const healthyData = operations?.dataHealth.every((issue) => issue.affectedRows === 0) ?? false;
  const showCompetitors = modules.length === 0 || modules.some((module) => module.module_key === 'intelligence_competitors' && module.enabled);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Business Insights & Owner Reporting</h2>
        <p className="text-sm text-muted-foreground">Verified paid orders only · Europe/Dublin trading time · Open one insight area at a time</p>
      </div>

      <Accordion type="single" collapsible defaultValue="executive" className="space-y-3">
        <AccordionItem value="executive" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={TrendingUp} title="Executive summary" description="Revenue, order value and customer movement" />
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {kpisError && <AnalyticsError onRetry={() => void refetchKpis()} />}
            {!kpisError && <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last 7 Days Revenue</p>
                <p className="text-2xl font-bold text-primary">
                  {kpisLoading ? '...' : `€${kpis?.totalRevenue.toFixed(0)}`}
                </p>
                {!kpisLoading && kpis && (
                  <div className={`flex items-center gap-1 text-xs ${
                    kpis.weekOverWeekChange >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {kpis.weekOverWeekChange >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {kpis.weekOverWeekChange >= 0 ? '+' : ''}{kpis.weekOverWeekChange.toFixed(1)}% vs previous 7 days
                  </div>
                )}
              </div>
              <DollarSign className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
                <p className="text-2xl font-bold">
                  {kpisLoading ? '...' : `€${kpis?.averageOrderValue.toFixed(2)}`}
                </p>
                <p className="text-xs text-muted-foreground">per transaction</p>
              </div>
              <ShoppingBag className="w-8 h-8 text-blue-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">
                  {kpisLoading ? '...' : kpis?.totalCustomers}
                </p>
                <p className="text-xs text-muted-foreground">all time</p>
              </div>
              <Users className="w-8 h-8 text-violet-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Returning Rate</p>
                <p className="text-2xl font-bold text-green-400">
                  {kpisLoading ? '...' : `${kpis?.returningCustomerRate.toFixed(0)}%`}
                </p>
                <p className="text-xs text-muted-foreground">repeat customers</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
            </div>}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="operations" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={Activity} title="Operations & service speed" description="Prep times, add-ons and reporting health" />
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {/* Reads v_prep_time and v_wait_time_accuracy directly. The 14-day
                snapshot below returned prep_time: null through the closure, which
                is what the browse test saw as "No average prep time". */}
            <div className="mb-4"><ServiceSpeedPanel /></div>

            {operationsLoading && <div className="h-64 animate-pulse rounded-lg bg-secondary/30" />}
            {operationsError && <AnalyticsError onRetry={() => void refetchOperations()} />}
            {!operationsLoading && !operationsError && operations && (
              <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4 flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Modifier Attach Rate</p>
                  <p className="text-2xl font-bold">{operations.modifierAttachRate === null ? 'No data' : `${operations.modifierAttachRate.toFixed(1)}%`}</p>
                  <p className="text-xs text-muted-foreground">paid orders with an add-on</p>
                </div>
                <Paperclip className="w-8 h-8 text-violet-400 opacity-60" />
              </CardContent>
            </Card>
            <Card className={`bg-card ${healthyData ? 'border-green-500/40' : 'border-amber-500/40'}`}>
              <CardContent className="p-4 flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Reporting Data Health</p>
                  <p className={`text-2xl font-bold ${healthyData ? 'text-green-400' : 'text-amber-400'}`}>
                    {healthyData ? 'Healthy' : 'Needs review'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {operations.dataHealth.reduce((sum, issue) => sum + issue.affectedRows, 0)} affected records
                  </p>
                </div>
                <Activity className="w-8 h-8 text-green-400 opacity-60" />
              </CardContent>
            </Card>
          </div>

          {!healthyData && operations.dataHealth.some((issue) => issue.affectedRows > 0) && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" /> Data Integrity Alerts</CardTitle></CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {operations.dataHealth.filter((issue) => issue.affectedRows > 0).map((issue) => (
                  <div key={issue.issue} className="rounded-md bg-background/50 p-3 flex justify-between gap-3">
                    <span>{issue.issue}</span><span className="font-bold text-amber-400">{issue.affectedRows}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="sales" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={DollarSign} title="Sales & ordering channels" description="Daily trade, payment split and channel contribution" />
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {operationsLoading && <div className="h-64 animate-pulse rounded-lg bg-secondary/30" />}
            {operationsError && <AnalyticsError onRetry={() => void refetchOperations()} />}
            {!operationsLoading && !operationsError && operations && (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card className="overflow-hidden border-border bg-card">
                  <CardHeader><CardTitle className="text-lg">Last 14 Trading Days</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    {operations.dailySales.length === 0 ? (
                      <p className="py-8 text-center text-muted-foreground">No paid-order data is available yet.</p>
                    ) : (
                      <table className="w-full min-w-[520px] text-sm">
                        <thead className="border-b border-border text-muted-foreground">
                          <tr><th className="py-2 text-left">Date</th><th className="text-right">Orders</th><th className="text-right">Revenue</th><th className="text-right">AOV</th><th className="text-right">Cash / Card</th></tr>
                        </thead>
                        <tbody>
                          {operations.dailySales.map((day) => (
                            <tr key={day.tradeDate} className="border-b border-border/50 last:border-0">
                              <td className="py-2 font-medium">{day.tradeDate}</td><td className="text-right">{day.orders}</td><td className="text-right">€{day.revenue.toFixed(2)}</td><td className="text-right">€{day.averageOrderValue.toFixed(2)}</td><td className="text-right text-muted-foreground">{day.cashOrders} / {day.cardOrders}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-border bg-card">
                  <CardHeader><CardTitle className="text-lg">Sales by Ordering Channel</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    {operations.channelMix.length === 0 ? (
                      <p className="py-8 text-center text-muted-foreground">No channel data is available yet.</p>
                    ) : (
                      <table className="w-full min-w-[460px] text-sm">
                        <thead className="border-b border-border text-muted-foreground">
                          <tr><th className="py-2 text-left">Channel</th><th className="text-right">Orders</th><th className="text-right">Revenue</th><th className="text-right">Share</th><th className="text-right">AOV</th></tr>
                        </thead>
                        <tbody>
                          {operations.channelMix.map((channel) => (
                            <tr key={channel.channel} className="border-b border-border/50 last:border-0">
                              <td className="py-2 font-medium">{formatChannel(channel.channel)}</td><td className="text-right">{channel.orders}</td><td className="text-right">€{channel.revenue.toFixed(2)}</td><td className="text-right">{channel.orderShare.toFixed(1)}%</td><td className="text-right">€{channel.averageOrderValue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="demand" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={Flame} title="Demand & peak trading" description="See the busiest days and hours" />
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Flame className="h-5 w-5 text-primary" />Peak Performance Heatmap</CardTitle></CardHeader>
              <CardContent><HeatmapChart /></CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="menu" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={BarChart3} title="Menu performance" description="Compare item demand by trading period" />
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary" />Item Leaderboard</CardTitle></CardHeader>
              <CardContent><ItemLeaderboardChart /></CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="forecast" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={TrendingUp} title="Demand forecast" description="Next 14 days by weekday, with confidence" />
          </AccordionTrigger>
          <AccordionContent className="pt-2"><DemandForecastPanel /></AccordionContent>
        </AccordionItem>

        <AccordionItem value="menu-engineering" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={Lightbulb} title="Menu engineering" description="Stars, workhorses, puzzles and dogs" />
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2"><MenuEngineeringPanel /><ItemTrendPanel /></AccordionContent>
        </AccordionItem>

        <AccordionItem value="customers" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={Users} title="Customers" description="Repeat rate, cohorts and what sells together" />
          </AccordionTrigger>
          <AccordionContent className="pt-2"><CustomersPanel /></AccordionContent>
        </AccordionItem>

        <AccordionItem value="labour" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={Activity} title="Labour" description="Cost against revenue, cover against demand" />
          </AccordionTrigger>
          <AccordionContent className="pt-2"><LabourPanel /></AccordionContent>
        </AccordionItem>

        <AccordionItem value="marketing-roi" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={DollarSign} title="Marketing return" description="Blended return and measured broadcast uplift" />
          </AccordionTrigger>
          <AccordionContent className="pt-2"><MarketingRoiPanel /></AccordionContent>
        </AccordionItem>

        {showCompetitors && <AccordionItem value="competitors" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={Search} title="Competitor intelligence" description="Evidence-backed prices, offers, ratings and review movement" />
          </AccordionTrigger>
          <AccordionContent className="pt-2"><CompetitorIntelligence /></AccordionContent>
        </AccordionItem>}

        <AccordionItem value="roadmap" className="overflow-hidden rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="gap-3 py-4 hover:no-underline">
            <SectionHeading icon={Compass} title="FoodOS insight library" description="Live reporting and the next intelligence modules" />
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <div className="grid gap-4 xl:grid-cols-3">
              {insightRoadmap.map((group) => (
                <Card key={group.status} className={group.tone}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4" />{group.status}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm text-foreground/90">
                      {group.items.map((item) => <li key={item} className="flex gap-2"><span className="mt-1 text-primary">•</span><span>{item}</span></li>)}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
