import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCartStore } from '@/stores/cartStore';

/**
 * Hook to sync cart state with authentication.
 * - Loads guest cart from localStorage for unauthenticated users
 * - Merges guest cart and loads from Supabase on login
 * - Clears and loads guest cart on logout
 */
export const useCartSync = () => {
  const syncWithUser = useCartStore((state) => state.syncWithUser);

  useEffect(() => {
    // Initial sync based on current session
    const initSync = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await syncWithUser(session?.user?.id || null);
    };

    initSync();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN') {
          await syncWithUser(session?.user?.id || null);
        } else if (event === 'SIGNED_OUT') {
          await syncWithUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [syncWithUser]);
};
