import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, publicSupabase } from '@/integrations/supabase/client';
import { normaliseStoreStatus, type StoreStatusPayload } from '@/lib/storeStatus';
import { useAppSettings } from './useAppSettings';
import { createRealtimeChannelName } from '@/lib/realtimeChannel';

const DEV_MODE_KEY = 'dev_mode_bypass';

/**
 * The single source of store status for the whole app.
 *
 * Calls public.get_store_status(), which resolves the manual toggle, today's
 * opening hours and the wait time together in Europe/Dublin. Nothing here
 * recomputes from is_store_open or opening_hours — three components doing that
 * independently is what produced "open with a 20 minute wait", "Closed" and
 * "STORE OPEN" simultaneously on 1 September.
 *
 * Status is time-dependent, so it refetches every 60s: a truck that opens at
 * 12:00 should start taking orders without the customer reloading.
 */
export function useStoreStatus() {
  const queryClient = useQueryClient();
  const [devModeRequested, setDevModeRequested] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return import.meta.env.DEV && localStorage.getItem(DEV_MODE_KEY) === 'true';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      setDevModeRequested(import.meta.env.DEV && localStorage.getItem(DEV_MODE_KEY) === 'true');
    };
    handleStorageChange();
    window.addEventListener('devModeChanged', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('devModeChanged', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const toggleDevMode = useCallback(() => {
    if (!import.meta.env.DEV) return false;
    const newValue = !devModeRequested;
    localStorage.setItem(DEV_MODE_KEY, newValue.toString());
    setDevModeRequested(newValue);
    window.dispatchEvent(new Event('devModeChanged'));
    return newValue;
  }, [devModeRequested]);

  const setDevMode = useCallback((enabled: boolean) => {
    if (!import.meta.env.DEV) return;
    localStorage.setItem(DEV_MODE_KEY, enabled.toString());
    setDevModeRequested(enabled);
    window.dispatchEvent(new Event('devModeChanged'));
  }, []);

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['store-status'],
    queryFn: async () => {
      // Public client: this is read logged-out on every customer surface.
      // types.ts predates get_store_status(); regenerating types removes the cast.
      const { data: payload, error: rpcError } = await publicSupabase.rpc(
        'get_store_status' as never,
      );
      if (rpcError) throw rpcError;
      return (payload ?? null) as StoreStatusPayload | null;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
    retry: 1,
  });

  // A staff toggle must show up immediately rather than after the next poll.
  useEffect(() => {
    const channel = supabase
      // Unique per hook instance. A shared fixed name meant the first screen to
      // unmount removed the channel for every other screen on the page.
      .channel(createRealtimeChannelName('store-status-settings'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['store-status'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // A laptop waking from sleep or a phone app returning to the front does not
  // always fire a focus event. Re-check the moment the screen is visible again.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['store-status'] });
      }
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('pageshow', recheck);
    window.addEventListener('online', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('pageshow', recheck);
      window.removeEventListener('online', recheck);
    };
  }, [queryClient]);

  // An error must not read as "open" — normalise(null) fails closed.
  const status = normaliseStoreStatus(
    error ? null : data,
    devModeRequested,
    import.meta.env.DEV,
  );

  // Settings remain available to the admin editors that write them. They are
  // NOT used to decide open/closed anywhere.
  const { data: appSettings } = useAppSettings();

  return {
    ...status,
    /** @deprecated use waitTime — kept so existing callers keep compiling */
    currentWaitTime: status.waitTime,
    isLoading,
    error,
    refetch,
    /** Millisecond timestamp of the last successful read; 0 if never. */
    statusUpdatedAt: error ? 0 : dataUpdatedAt,
    toggleDevMode,
    setDevMode,
    appSettings,
  };
}
