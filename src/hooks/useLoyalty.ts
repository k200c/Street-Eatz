import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface LoyaltyBalance {
  pointsBalance: number;
  lifetimePoints: number;
  rewardsRedeemed: number;
}

const EMPTY_BALANCE: LoyaltyBalance = {
  pointsBalance: 0,
  lifetimePoints: 0,
  rewardsRedeemed: 0,
};

export function useLoyalty(enabled: boolean) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['loyalty-balance', user?.id],
    queryFn: async (): Promise<LoyaltyBalance> => {
      if (!user?.id) return EMPTY_BALANCE;
      const { data, error } = await supabase
        .from('v_loyalty_balances')
        .select('points_balance, lifetime_points, rewards_redeemed')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return {
        pointsBalance: data?.points_balance ?? 0,
        lifetimePoints: data?.lifetime_points ?? 0,
        rewardsRedeemed: data?.rewards_redeemed ?? 0,
      };
    },
    enabled: enabled && Boolean(user?.id),
    staleTime: 30_000,
  });
}
