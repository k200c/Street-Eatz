import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAppSettings } from '@/hooks/useAppSettings';

/**
 * Loyalty points only accrue to signed-in accounts, and 53% of orders are guest
 * orders. Without this, a guest never learns stamps exist. Shown only to
 * signed-out visitors while loyalty is enabled.
 *
 * Copy is honest about the current state: points bank now, and redemption
 * happens with staff — there is no self-serve redeem button yet.
 */
export function LoyaltyGuestPrompt() {
  const { user, loading } = useAuth();
  const { data: settings } = useAppSettings();

  if (loading || user || !settings?.loyalty_enabled) return null;

  const cost = settings.loyalty_reward_cost ?? 7;
  const label = settings.loyalty_reward_label ?? 'a free drink or fries';

  return (
    <section className="px-4 py-4">
      <div className="street-card mx-auto flex max-w-3xl items-center gap-4 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Gift className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">
            Sign in to collect stamps
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {cost} points earns {label}. Points bank now on every order and you redeem them with staff at the truck.
          </p>
        </div>
        <Link
          to="/auth"
          className="flex h-11 shrink-0 items-center rounded-lg border border-primary px-4 font-heading text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}
