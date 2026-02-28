

# Plan: Per-Ingredient Add-on Pricing

## 1. Database Migration

Add three columns to `public.ingredients`:

```sql
ALTER TABLE public.ingredients
  ADD COLUMN ingredient_type text NOT NULL DEFAULT 'other',
  ADD COLUMN addon_price numeric(10,2) NOT NULL DEFAULT 0.50,
  ADD COLUMN addon_price_kids numeric(10,2) NOT NULL DEFAULT 0.50;

CREATE INDEX idx_ingredients_name ON public.ingredients(name);

-- Seed pricing rules
UPDATE public.ingredients SET ingredient_type = 'meat', addon_price = 2.50, addon_price_kids = 2.50 WHERE name ILIKE '%bacon%';
UPDATE public.ingredients SET ingredient_type = 'cheese', addon_price = 2.00, addon_price_kids = 2.00 WHERE name ILIKE '%halloumi%';
UPDATE public.ingredients SET ingredient_type = 'sauce', addon_price = 1.50, addon_price_kids = 0.00
  WHERE name ILIKE '%sauce%' OR name ILIKE '%mayo%' OR name ILIKE '%aioli%' OR name ILIKE '%relish%';
```

## 2. Update `src/types/database.ts`

Add `ingredient_type`, `addon_price`, `addon_price_kids` to the `Ingredient` interface.

## 3. Update `src/hooks/useProductIngredients.ts`

Include `ingredient_type`, `addon_price`, `addon_price_kids` in the select query so they flow to ProductSheet components.

## 4. Update `src/hooks/useIngredients.ts`

Include the new columns in the `Ingredient` interface and all queries/mutations.

## 5. Replace `getExtraPrice()` in `src/lib/pricingRules.ts`

Replace the keyword-based `getExtraPrice` with a new `getIngredientAddonPrice`:

```typescript
export function getIngredientAddonPrice(
  ingredient: { addon_price?: number | null; addon_price_kids?: number | null },
  productCategory: string
): number {
  if (productCategory === 'Kids Menu') {
    return ingredient.addon_price_kids ?? 0.50;
  }
  return ingredient.addon_price ?? 0.50;
}
```

Keep `getExtraPrice` as a deprecated fallback but it will no longer be called.

## 6. Update `src/components/customer/ProductSheet.tsx`

- In `getExtraIngredients()` (line ~247-256): replace `getExtraPrice(ing.name)` with `getIngredientAddonPrice(ing, product.category)`
- In the ingredient display UI: show `+€X.XX` using the ingredient's actual price
- Update `extrasTotal` calculation accordingly

## 7. Update `src/components/staff/StaffProductSheet.tsx`

Same changes as ProductSheet — replace `getExtraPrice(ing.name)` with `getIngredientAddonPrice(ing, product.category)`.

## 8. Create `src/components/staff/IngredientPriceManager.tsx`

New collapsible component with:
- Search input to filter ingredients by name
- Table/list showing: name (editable input), ingredient_type (dropdown: meat/cheese/sauce/other), addon_price (number input), addon_price_kids (number input)
- Sorted by ingredient_type then name
- Debounced save on change (500ms) via `supabase.from('ingredients').update()`
- Toast on error
- Uses `useAllIngredients()` from `useIngredients.ts`

## 9. Add IngredientPriceManager to Operations Quick Stock

In `src/components/staff/OperationsContent.tsx`: render `<IngredientPriceManager />` below the product list inside the Quick Stock card.

## 10. Add IngredientPriceManager to Command Center Quick Stock

In `src/pages/CommandCenter.tsx`: render `<IngredientPriceManager />` below the `QuickStockManager` component.

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Add 3 columns + index + seed data |
| `src/types/database.ts` | Add fields to Ingredient interface |
| `src/hooks/useProductIngredients.ts` | Include new columns in select |
| `src/hooks/useIngredients.ts` | Include new columns in interfaces and queries |
| `src/lib/pricingRules.ts` | Add `getIngredientAddonPrice()`, deprecate `getExtraPrice()` |
| `src/components/customer/ProductSheet.tsx` | Use `getIngredientAddonPrice` instead of `getExtraPrice` |
| `src/components/staff/StaffProductSheet.tsx` | Same |
| `src/components/staff/IngredientPriceManager.tsx` | New — editable ingredient pricing table |
| `src/components/staff/OperationsContent.tsx` | Add IngredientPriceManager |
| `src/pages/CommandCenter.tsx` | Add IngredientPriceManager |

