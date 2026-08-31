import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FoodOSModuleDomain = 'marketing' | 'operations' | 'intelligence' | 'customer' | 'finance';

export function useFoodOSModules() {
  return useQuery({
    queryKey: ['foodos-module-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('foodos_module_settings')
        .select('*')
        .order('domain')
        .order('display_order');

      if (error) throw error;
      return data;
    },
  });
}

export function useSetFoodOSModuleEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) => {
      const { data, error } = await supabase.rpc('set_foodos_module_enabled', {
        p_module_key: moduleKey,
        p_enabled: enabled,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodos-module-settings'] });
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
  });
}

export function useMarketingMetrics() {
  return useQuery({
    queryKey: ['marketing-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_metrics')
        .select('*')
        .order('period_end', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useOperationsSnapshot() {
  return useQuery({
    queryKey: ['foodos-operations-snapshot'],
    queryFn: async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const [inventory, shifts, safety] = await Promise.all([
        supabase.from('v_inventory_balances').select('*').order('low_stock', { ascending: false }).order('name'),
        supabase.from('roster_shifts').select('*').gte('shift_start', now.toISOString()).lte('shift_start', nextWeek).order('shift_start'),
        supabase.from('food_safety_logs').select('*').gte('recorded_at', today).order('recorded_at', { ascending: false }),
      ]);

      if (inventory.error) throw inventory.error;
      if (shifts.error) throw shifts.error;
      if (safety.error) throw safety.error;

      const inventoryValue = (inventory.data ?? []).reduce((sum, item) => (
        sum + Number(item.quantity_on_hand ?? 0) * Number(item.unit_cost ?? 0)
      ), 0);

      return {
        inventory: inventory.data ?? [],
        inventoryValue,
        lowStockCount: (inventory.data ?? []).filter((item) => item.low_stock).length,
        shifts: shifts.data ?? [],
        safetyLogs: safety.data ?? [],
        failedSafetyChecks: (safety.data ?? []).filter((log) => log.status === 'fail').length,
      };
    },
  });
}

export function useCompetitorIntelligence() {
  return useQuery({
    queryKey: ['competitor-intelligence'],
    queryFn: async () => {
      const { data: profiles, error: profileError } = await supabase
        .from('competitor_profiles')
        .select('*')
        .eq('active', true)
        .order('name');
      if (profileError) throw profileError;

      const { data: snapshots, error: snapshotError } = await supabase
        .from('competitor_snapshots')
        .select('*')
        .order('observed_at', { ascending: false });
      if (snapshotError) throw snapshotError;

      return { profiles: profiles ?? [], snapshots: snapshots ?? [] };
    },
  });
}

export function useCreateCompetitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; website_url?: string; google_maps_url?: string; notes?: string }) => {
      const { error } = await supabase.from('competitor_profiles').insert({
        name: input.name.trim(),
        website_url: input.website_url?.trim() || null,
        google_maps_url: input.google_maps_url?.trim() || null,
        notes: input.notes?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['competitor-intelligence'] }),
  });
}
