import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Read from v_loyalty_progress (security_invoker — a customer sees only their
 * own row). It carries the reward arithmetic the card needs, so points_per_reward
 * comes from the database rather than a fallback constant.
 */
export interface LoyaltyBalance {
  pointsBalance: number;
  lifetimePoints: number;
  rewardsRedeemed: number;
  pointsPerReward: number | null;
  rewardsAvailable: number;
  stampsOnCurrentCard: number;
  stampsUntilNextReward: number | null;
  canRedeemNow: boolean;
}

const EMPTY_BALANCE: LoyaltyBalance = {
  pointsBalance: 0,
  lifetimePoints: 0,
  rewardsRedeemed: 0,
  pointsPerReward: null,
  rewardsAvailable: 0,
  stampsOnCurrentCard: 0,
  stampsUntilNextReward: null,
  canRedeemNow: false,
};

interface LoyaltyProgressRow {
  points_balance: number | null;
  lifetime_points: number | null;
  rewards_redeemed: number | null;
  points_per_reward: number | null;
  rewards_available: number | null;
  stamps_on_current_card: number | null;
  stamps_until_next_reward: number | null;
  can_redeem_now: boolean | null;
}

export function useLoyalty(enabled: boolean) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['loyalty-progress', user?.id],
    queryFn: async (): Promise<LoyaltyBalance> => {
      if (!user?.id) return EMPTY_BALANCE;
      // types.ts predates v_loyalty_progress; regenerate to drop the casts.
      const { data, error } = await supabase
        .from('v_loyalty_progress' as never)
        .select('points_balance, lifetime_points, rewards_redeemed, points_per_reward, rewards_available, stamps_on_current_card, stamps_until_next_reward, can_redeem_now')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      const row = (data as unknown as LoyaltyProgressRow | null) ?? null;
      return {
        pointsBalance: row?.points_balance ?? 0,
        lifetimePoints: row?.lifetime_points ?? 0,
        rewardsRedeemed: row?.rewards_redeemed ?? 0,
        pointsPerReward: row?.points_per_reward ?? null,
        rewardsAvailable: row?.rewards_available ?? 0,
        stampsOnCurrentCard: row?.stamps_on_current_card ?? 0,
        stampsUntilNextReward: row?.stamps_until_next_reward ?? null,
        canRedeemNow: row?.can_redeem_now === true,
      };
    },
    enabled: enabled && Boolean(user?.id),
    staleTime: 30_000,
  });
}
