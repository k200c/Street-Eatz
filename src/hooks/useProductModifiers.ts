import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ModifierGroup, Modifier } from '@/types/database';

export interface ModifierGroupWithModifiers extends ModifierGroup {
  modifiers: Modifier[];
}

export function useProductModifiers(productId?: string) {
  return useQuery({
    queryKey: ['product-modifiers', productId],
    queryFn: async () => {
      if (!productId) return [];

      // Get modifier group IDs linked to this product
      const { data: productModifiers, error: pmError } = await supabase
        .from('product_modifiers')
        .select('group_id')
        .eq('product_id', productId);

      if (pmError) throw pmError;
      if (!productModifiers || productModifiers.length === 0) return [];

      const groupIds = productModifiers.map((pm) => pm.group_id).filter(Boolean) as string[];

      // Get modifier groups
      const { data: groups, error: groupsError } = await supabase
        .from('modifier_groups')
        .select('*')
        .in('id', groupIds);

      if (groupsError) throw groupsError;

      // Get modifiers for these groups
      const { data: modifiers, error: modifiersError } = await supabase
        .from('modifiers')
        .select('*')
        .in('group_id', groupIds);

      if (modifiersError) throw modifiersError;

      // Combine groups with their modifiers
      const groupsWithModifiers: ModifierGroupWithModifiers[] = (groups || []).map((group) => ({
        ...group,
        modifiers: (modifiers || []).filter((m) => m.group_id === group.id),
      }));

      return groupsWithModifiers;
    },
    enabled: !!productId,
    staleTime: 1000 * 60 * 5,
  });
}
