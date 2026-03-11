/**
 * Dynamic pricing rules for ingredient extras
 * Used consistently across both Customer and Staff interfaces
 */

/**
 * Get per-ingredient add-on price from the database.
 * Uses the ingredient's stored addon_price / addon_price_kids columns.
 * Falls back to €0.50 if fields are null.
 */
export function getIngredientAddonPrice(
  ingredient: { addon_price?: number | null; addon_price_kids?: number | null },
  productCategory: string
): number {
  if (productCategory === 'Kids Menu') {
    return ingredient.addon_price_kids ?? 0.50;
  }
  return ingredient.addon_price ?? 0.50;
}

/**
 * Calculate total price contribution for a modifier, accounting for quantity.
 * Backward-compatible: modifiers without `quantity` default to 1.
 */
export function getModifierTotal(mod: { price_adjustment: number; quantity?: number }): number {
  return mod.price_adjustment * (mod.quantity || 1);
}

/**
 * Format price for display
 * @param price - Price in euros
 * @returns Formatted string like "+€2.50" or "FREE"
 */
export function formatExtraPrice(price: number): string {
  if (price <= 0) return 'FREE';
  return `+€${price.toFixed(2)}`;
}

// ── Loaded Fries pricing (Make It Epic) ──────────────────────────

export const LOADED_FRIES_STANDARD_PRICE = 6.50;
export const LOADED_FRIES_SPECIALS_PRICE = 3.50;

/**
 * Category-based loaded fries pricing for "Make It Epic" upsell.
 * Specials get €3.50, all other categories get €6.50.
 */
export function getLoadedFriesPrice(category: string): number {
  return category === 'Specials' ? LOADED_FRIES_SPECIALS_PRICE : LOADED_FRIES_STANDARD_PRICE;
}

// ── Fries sizing ("Make it Large") ───────────────────────────────

/**
 * Whether a product supports the "Make it Large" upsell.
 * Requires Fries category AND a valid fries_large_price.
 */
export function hasFriesLargeOption(product: { fries_large_price?: number | null; category: string }): boolean {
  return product.category === 'Fries' && product.fries_large_price != null && product.fries_large_price > 0;
}

/**
 * Returns the large price if available, null otherwise.
 */
export function getFriesLargePrice(product: { fries_large_price?: number | null }): number | null {
  return product.fries_large_price ?? null;
}

/**
 * Returns upgrade delta (large - small) rounded to 2 decimals.
 */
export function getFriesLargeUpgradeDelta(product: { fries_large_price?: number | null; price: number }): number {
  if (!product.fries_large_price) return 0;
  return Math.round((product.fries_large_price - product.price) * 100) / 100;
}


