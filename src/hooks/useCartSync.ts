import { useEffect, useRef } from 'react';
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
  const isMounted = useRef(true);
  const hasInitialized = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    // Initial sync based on current session - WRAPPED IN TRY/CATCH
    const initSync = async () => {
      if (hasInitialized.current) return;
      hasInitialized.current = true;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted.current) {
          await syncWithUser(session?.user?.id || null);
        }
      } catch (error) {
        console.error('[CartSync] getSession failed:', error);
        // Fallback to guest mode
        if (isMounted.current) {
          await syncWithUser(null);
        }
      }
    };

    initSync();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted.current) return;
        
        if (event === 'SIGNED_IN') {
          await syncWithUser(session?.user?.id || null);
        } else if (event === 'SIGNED_OUT') {
          await syncWithUser(null);
        }
      }
    );

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [syncWithUser]);
};
