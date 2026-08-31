import { useQuery } from '@tanstack/react-query';
import { publicSupabase } from '@/integrations/supabase/client';

/**
 * Single-row business profile: name, address, contact and social URLs.
 *
 * This is the source of truth for NAP (name, address, phone) across the site
 * and the SEO scripts. Business facts must never be hardcoded in components —
 * a phone number in three files is a phone number that will be wrong in two.
 *
 * Read through the public client because these pages are crawled and viewed
 * logged-out.
 */
export interface BusinessProfile {
  id: string;
  legal_name: string | null;
  display_name: string | null;
  description: string | null;
  street_address: string | null;
  locality: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  telephone: string | null;
  email: string | null;
  website_url: string | null;
  menu_url: string | null;
  order_url: string | null;
  google_review_url: string | null;
  google_maps_url: string | null;
  price_range: string | null;
  serves_cuisine: string | null;
  accepts_reservations: boolean | null;
  social_urls: Record<string, string> | null;
  updated_at: string | null;
}

export function useBusinessProfile() {
  return useQuery({
    queryKey: ['business-profile'],
    queryFn: async () => {
      // src/integrations/supabase/types.ts was generated before business_profile
      // existed, so the table is absent from the generated union. Casting the
      // table name is the narrow fix; regenerating types removes the need for
      // it and for the matching cast on the result.
      const { data, error } = await publicSupabase
        .from('business_profile' as never)
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown as BusinessProfile | null) ?? null;
    },
    staleTime: 1000 * 60 * 30,
  });
}
