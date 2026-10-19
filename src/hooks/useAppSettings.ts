import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, publicSupabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { createRealtimeChannelName } from '@/lib/realtimeChannel';
import { StaffActionError, withTimeout } from '@/lib/staffConnection';

export interface AppSettings {
  id: number;
  is_store_open: boolean;
  current_wait_time: string;
  updated_at: string;
  marketing_banner_text: string | null;
  marketing_banner_enabled: boolean;
  card_payment_provider: 'viva' | 'mypos';
  online_payments_enabled: boolean;
  pay_on_collection_enabled: boolean;
  flatbread_addon_enabled: boolean;
  preorders_enabled: boolean;
  preorder_min_notice_minutes: number;
  preorder_max_days: number;
  preorder_slot_interval_minutes: number;
  preorder_slot_capacity: number;
  preorder_kitchen_lead_minutes: number;
  preorder_hours: Record<string, { start: string; end: string }>;
  loyalty_enabled: boolean;
  loyalty_points_per_order: number;
  loyalty_reward_cost: number;
  loyalty_reward_label: string;
  google_review_url: string | null;
}

export function useAppSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await publicSupabase
        .from('app_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;
      return data as AppSettings | null;
    },
    staleTime: 0, // Always fetch fresh data
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(createRealtimeChannelName('app-settings-changes'))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['app-settings'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Pick<AppSettings, 'is_store_open' | 'current_wait_time' | 'marketing_banner_text' | 'marketing_banner_enabled' | 'card_payment_provider' | 'online_payments_enabled' | 'pay_on_collection_enabled' | 'flatbread_addon_enabled' | 'preorders_enabled' | 'preorder_min_notice_minutes' | 'preorder_max_days' | 'preorder_slot_interval_minutes' | 'preorder_slot_capacity' | 'preorder_kitchen_lead_minutes' | 'preorder_hours' | 'loyalty_enabled' | 'loyalty_points_per_order' | 'loyalty_reward_cost' | 'loyalty_reward_label' | 'google_review_url'>>) => {
      // A staff write must be confirmed or fail loudly within seconds — never
      // hang. On 16 Oct an expired login made every store toggle go nowhere,
      // silently, for three hours. See src/lib/staffConnection.ts.
      const { data: sessionData } = await withTimeout(
        supabase.auth.getSession(),
        5_000,
        'Could not check the login on this screen',
      );
      if (!sessionData.session) {
        throw new StaffActionError('This screen is signed out', 'signed_out');
      }

      const { data, error } = await withTimeout(
        supabase
          .from('app_settings')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', 1)
          .select()
          .maybeSingle(),
        10_000,
        'The server did not answer',
      );

      if (error) throw error;
      // No row back means the update matched nothing: the account on this
      // screen is not allowed to change settings. Never report that as saved.
      if (!data) {
        throw new StaffActionError('The change was not saved', 'not_saved');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      queryClient.invalidateQueries({ queryKey: ['store-status'] });
    },
  });
}
