import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HeatmapData {
  hour: number;
  day: number;
  count: number;
}

export interface ItemLeaderboardEntry {
  name: string;
  count: number;
  revenue: number;
}

export interface RevenueKPIs {
  totalRevenue: number;
  weekOverWeekChange: number;
  averageOrderValue: number;
  totalCustomers: number;
  returningCustomerRate: number;
}

export interface OperationalInsights {
  dailySales: Array<{
    tradeDate: string;
    orders: number;
    revenue: number;
    averageOrderValue: number;
    cashOrders: number;
    cardOrders: number;
  }>;
  channelMix: Array<{
    channel: string;
    orders: number;
    revenue: number;
    averageOrderValue: number;
    orderShare: number;
  }>;
  prepTime: {
    average: number;
    median: number;
    p90: number;
  } | null;
  modifierAttachRate: number | null;
  dataHealth: Array<{ issue: string; affectedRows: number }>;
}

interface ManagementSnapshot {
  kpis: {
    revenue: number;
    orders: number;
    average_order_value: number;
    previous_period_revenue: number;
    period_change_pct: number;
  };
  customers: {
    total: number;
    returning: number;
    returning_rate_pct: number;
  };
  daily_sales: Array<{
    trade_date: string;
    orders: number;
    revenue: number;
    avg_order_value: number;
    cash_orders: number;
    card_orders: number;
  }>;
  channel_mix: Array<{
    channel: string;
    orders: number;
    revenue: number;
    avg_order_value: number;
    order_share_pct: number;
  }>;
  item_mix: Array<{
    product_name: string;
    units_sold: number;
    revenue: number;
  }>;
  prep_time: {
    average: number;
    median: number;
    p90: number;
  } | null;
  modifier_attach_rate_pct: number | null;
  data_health: Array<{ issue: string; rows_affected: number }>;
  heatmap: Array<{ hour: number; day: number; count: number }>;
}

async function getManagementSnapshot(days: number, mealPeriod = 'all'): Promise<ManagementSnapshot> {
  const { data, error } = await supabase.rpc('get_management_business_snapshot', {
    p_days: days,
    p_meal_period: mealPeriod,
  });
  if (error) throw error;
  return data as unknown as ManagementSnapshot;
}

export function useOrdersHeatmap() {
  return useQuery({
    queryKey: ['orders-heatmap'],
    queryFn: async () => {
      const snapshot = await getManagementSnapshot(30);

      // Initialize heatmap grid (24 hours x 7 days)
      const heatmap: HeatmapData[] = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          heatmap.push({ hour, day, count: 0 });
        }
      }

      // Count orders by hour and day
      snapshot.heatmap.forEach(({ hour, day, count }) => {
        const index = day * 24 + hour;
        if (heatmap[index]) {
          heatmap[index].count = Number(count ?? 0);
        }
      });

      return heatmap;
    },
  });
}

export function useItemLeaderboard(mealPeriod: 'all' | 'lunch' | 'dinner' = 'all') {
  return useQuery({
    queryKey: ['item-leaderboard', mealPeriod],
    queryFn: async () => {
      const snapshot = await getManagementSnapshot(30, mealPeriod);
      return snapshot.item_mix.map((item) => ({
        name: item.product_name || 'Unknown',
        count: Number(item.units_sold ?? 0),
        revenue: Number(item.revenue ?? 0),
      })) as ItemLeaderboardEntry[];
    },
  });
}

export function useRevenueKPIs() {
  return useQuery({
    queryKey: ['revenue-kpis'],
    queryFn: async () => {
      const snapshot = await getManagementSnapshot(7);

      return {
        totalRevenue: Number(snapshot.kpis.revenue ?? 0),
        weekOverWeekChange: Number(snapshot.kpis.period_change_pct ?? 0),
        averageOrderValue: Number(snapshot.kpis.average_order_value ?? 0),
        totalCustomers: Number(snapshot.customers.total ?? 0),
        returningCustomerRate: Number(snapshot.customers.returning_rate_pct ?? 0),
      } as RevenueKPIs;
    },
  });
}

export function useOperationalInsights() {
  return useQuery({
    queryKey: ['operational-insights'],
    queryFn: async (): Promise<OperationalInsights> => {
      const snapshot = await getManagementSnapshot(14);

      return {
        dailySales: snapshot.daily_sales.map((row) => ({
          tradeDate: row.trade_date || '',
          orders: Number(row.orders ?? 0),
          revenue: Number(row.revenue ?? 0),
          averageOrderValue: Number(row.avg_order_value ?? 0),
          cashOrders: Number(row.cash_orders ?? 0),
          cardOrders: Number(row.card_orders ?? 0),
        })),
        channelMix: snapshot.channel_mix.map((row) => ({
          channel: row.channel || 'unknown',
          orders: Number(row.orders ?? 0),
          revenue: Number(row.revenue ?? 0),
          averageOrderValue: Number(row.avg_order_value ?? 0),
          orderShare: Number(row.order_share_pct ?? 0),
        })),
        prepTime: snapshot.prep_time ? {
          average: Number(snapshot.prep_time.average ?? 0),
          median: Number(snapshot.prep_time.median ?? 0),
          p90: Number(snapshot.prep_time.p90 ?? 0),
        } : null,
        modifierAttachRate: snapshot.modifier_attach_rate_pct === null
          || snapshot.modifier_attach_rate_pct === undefined
          ? null
          : Number(snapshot.modifier_attach_rate_pct),
        dataHealth: snapshot.data_health.map((row) => ({
          issue: row.issue || 'Unknown data issue',
          affectedRows: Number(row.rows_affected ?? 0),
        })),
      };
    },
  });
}
