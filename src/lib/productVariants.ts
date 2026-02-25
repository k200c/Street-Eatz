/**
 * Fries size variant pairing utility
 * Maps Small ↔ Large fries products using explicit DB product IDs.
 * Only products with a valid pair get the size toggle in the UI.
 */

const FRIES_VARIANT_PAIRS: Array<{ smallId: string; largeId: string; baseName: string }> = [
  {
    smallId: 'fc7e55cf-e01d-4c3f-a51d-2a09024774d8', // Small Truffle Parmesan Fries
    largeId: 'db58a98d-e755-4f42-8606-62c282881d22', // Large Truffle Parmesan Fries
    baseName: 'Truffle Parmesan Fries',
  },
  {
    smallId: '50ba3f2f-b10f-4338-83df-25e726d1f771', // Small Sloppy Fries
    largeId: 'd4c8f458-23f1-4f40-865a-12d5687ffa18', // Sloppy Jose Fries (Large)
    baseName: 'Sloppy Fries',
  },
];

// Map "Truffle Parmesan Fries" (no size prefix) as alias for small variant
const ALIAS_TO_SMALL: Record<string, string> = {
  'd81357ed-6ef5-42fe-9e77-4161406758c4': 'fc7e55cf-e01d-4c3f-a51d-2a09024774d8',
};

export interface FriesVariantPair {
  smallId: string;
  largeId: string;
  baseName: string;
}

export function getFriesVariantPair(productId: string): FriesVariantPair | null {
  const resolvedId = ALIAS_TO_SMALL[productId] || productId;
  return FRIES_VARIANT_PAIRS.find(p => p.smallId === resolvedId || p.largeId === resolvedId) || null;
}

export function isSmallVariant(productId: string): boolean {
  const resolvedId = ALIAS_TO_SMALL[productId] || productId;
  return FRIES_VARIANT_PAIRS.some(p => p.smallId === resolvedId);
}

export function isFriesProduct(product: { category: string }): boolean {
  return product.category === 'Fries';
}
