import { useAllIngredients } from '@/hooks/useIngredients';
import { getIngredientAddonPrice } from '@/lib/pricingRules';

/**
 * Alias map bridging product-table / UI names → ingredient-table names.
 * Keys must be lowercase. Values must match the DB ingredient name exactly.
 */
const INGREDIENT_ALIASES: Record<string, string> = {
  "jerk mayonnaise": "jerk mayo",
  "mojo picon sauce": "mojo picón sauce",
  "bbq sauce": "chipotle bbq sauce",
  "chipotle mayo": "chipotle bbq sauce",
  "curry mayonnaise": "curry mayo",
};

/** Resolve a UI/product name to its DB ingredient name via alias map */
function resolveAlias(name: string): string {
  const lower = name.toLowerCase();
  return INGREDIENT_ALIASES[lower] ?? lower;
}

/**
 * Shared hook that fetches all ingredients and returns lookup functions.
 * Use this to resolve DB-driven addon prices and stock status by ingredient name.
 */
export function useIngredientPriceLookup() {
  const { data: allIngredients, isLoading } = useAllIngredients();

  /**
   * Look up addon price for an ingredient by name.
   * Falls back to €0 if ingredient not found in DB (makes lookup failures visible).
   */
  const lookupPrice = (name: string, productCategory: string): number => {
    if (!allIngredients) return 0;
    const resolved = resolveAlias(name);
    const ingredient = allIngredients.find(
      (ing) => ing.name.toLowerCase() === resolved
    );
    if (!ingredient) return 0;
    return getIngredientAddonPrice(ingredient, productCategory);
  };

  /**
   * Check if an ingredient is in stock by name.
   * Returns true if ingredient not found (safe fallback).
   */
  const isInStock = (name: string): boolean => {
    if (!allIngredients) return true;
    const resolved = resolveAlias(name);
    const ingredient = allIngredients.find(
      (ing) => ing.name.toLowerCase() === resolved
    );
    if (!ingredient) return true;
    return ingredient.in_stock !== false;
  };

  return { lookupPrice, isInStock, isLoading };
}
