import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ProductAllergen {
  id: string;
  product_id: string;
  allergen_numbers: number[];
  created_at: string;
  updated_at: string;
}

/**
 * Fetch allergen numbers for a specific product
 */
export function useProductAllergens(productId: string | null) {
  return useQuery({
    queryKey: ['product-allergens', productId],
    queryFn: async () => {
      if (!productId) return null;
      
      const { data, error } = await supabase
        .from('product_allergens')
        .select('*')
        .eq('product_id', productId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data as ProductAllergen | null;
    },
    enabled: !!productId,
  });
}

/**
 * Fetch allergens for all products (for list views)
 */
export function useAllProductAllergens() {
  return useQuery({
    queryKey: ['all-product-allergens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_allergens')
        .select('*');
      
      if (error) throw error;
      
      // Convert to a map for easy lookup by product_id
      const allergensMap = new Map<string, number[]>();
      (data as ProductAllergen[]).forEach((item) => {
        allergensMap.set(item.product_id, item.allergen_numbers);
      });
      
      return allergensMap;
    },
  });
}

/**
 * Allergen key - numerical system 1-14
 */
export const ALLERGEN_KEY: Record<number, string> = {
  1: 'Gluten',
  2: 'Crustaceans',
  3: 'Eggs',
  4: 'Fish',
  5: 'Peanuts',
  6: 'Soy',
  7: 'Milk',
  8: 'Nuts',
  9: 'Celery',
  10: 'Mustard',
  11: 'Sesame',
  12: 'Sulphites',
  13: 'Lupins',
  14: 'Molluscs',
};
