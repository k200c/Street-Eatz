

# Modifier System Upgrades: Pricing, Patty Stepper, Fries Drinks, Kids +/-

## Summary

Four changes to the product customization system, all sharing a single pricing brain (`pricingRules.ts`), consistent across Customer and Staff interfaces.

---

## Change 1: Default Extra Price = EUR 0.50

**Current behavior**: `defaultExtraPrice` in `src/lib/pricingRules.ts` line 20 is `0` -- all non-meat, non-cheese, non-sauce extras are free.

**New behavior**: Change to `0.50`. This single-line change propagates everywhere because both `ProductSheet` and `StaffProductSheet` already call `getExtraPrice()` for display and `getExtraIngredients()` for cart totals.

### Files changed

| File | Change |
|------|--------|
| `src/lib/pricingRules.ts` | `defaultExtraPrice: 0` becomes `defaultExtraPrice: 0.50` |
| `src/components/staff/StaffProductSheet.tsx` | Update pricing legend from "Others FREE" to "Others +EUR0.50" (line 705) |
| `src/components/customer/ProductSheet.tsx` | Add same pricing legend below the Customize section (currently missing on customer side) |

**Backward compatibility**: Existing cart items stored in Supabase/localStorage already have `price_adjustment` baked in at the time of adding. Old items with `0.00` extras will still render and total correctly -- the pricing rule only applies at add/edit time.

---

## Change 2: Beef Patty Stepper (0-4)

**Current behavior**: Beef Patty is a checkbox in `STANDALONE_ADDONS` -- toggle on/off, always 1 unit at EUR 2.50.

**New behavior**: Replace the checkbox with a quantity stepper (0 to 4). Each patty costs EUR 2.50. Display as "Beef Patty x3 (+EUR7.50)" in cart/KDS.

### Approach: Add optional `quantity` field to `SelectedModifier`

This is the cleanest approach that preserves backward compatibility (old items without `quantity` default to 1).

### Files changed

| File | Change |
|------|--------|
| `src/types/database.ts` | Add `quantity?: number` to `SelectedModifier` interface |
| `src/lib/pricingRules.ts` | Add helper `getModifierTotal(mod)` that returns `price_adjustment * (quantity or 1)` |
| `src/components/customer/ProductSheet.tsx` | (a) Add `beefPattyCount` state (0-4). (b) Replace Beef Patty checkbox row with a stepper UI. (c) Update `buildAllModifiers` to push one entry with `quantity`. (d) Update `currentAddonsTotal` calc to use `getModifierTotal`. (e) In edit-mode init, read `quantity` from existing modifier. |
| `src/components/staff/StaffProductSheet.tsx` | Same changes as customer ProductSheet |
| `src/stores/cartStore.ts` | Update `modifiersTotal` calc in `loadCartFromSupabase`, `addItem`, `updateItem`, `updateQuantity` to use `getModifierTotal` |
| `src/stores/staffCartStore.ts` | Same calc update |
| `src/pages/Cart.tsx` | Update modifier badge display: if `quantity > 1`, show "Beef Patty x3 (+EUR7.50)" |
| `src/components/staff/KitchenDisplaySystem.tsx` | When rendering modifiers, show quantity if > 1 |

### UI for stepper (both ProductSheet components)

```
Beef Patty          [ - ]  2  [ + ]     +EUR5.00
```

- Min 0, max 4
- When count is 0, row appears unselected (muted styling)
- When count >= 1, row highlighted like other selected addons
- Price shown dynamically: `count * 2.50`

### Data model

A cart item with 3 beef patties stores:

```json
{
  "id": "beef-patty",
  "name": "Beef Patty",
  "price_adjustment": 2.50,
  "modifier_type": "addon",
  "quantity": 3
}
```

The total contribution is `2.50 * 3 = 7.50`. The helper `getModifierTotal` centralizes this calc.

---

## Change 3: Fries "Make It Epic" -- Add Drinks

**Current behavior**: Fries are excluded from Make It Epic (`showMakeItEpic = category !== 'Fries' && ...`). Fries only show "Customize Your Fries" for sauce add-ons.

**New behavior**: Add a "Make It Epic" section for Fries that contains a Drink dropdown (same as the one in Burgers/Specials Make It Epic). No loaded fries or other addons -- just the drink upsell.

### Files changed

| File | Change |
|------|--------|
| `src/components/customer/ProductSheet.tsx` | (a) Add `showFriesMakeItEpic = product.category === 'Fries'`. (b) Render a new "Make It Epic" section for Fries (between the fries customization section and the ingredient section) with the existing drinks dropdown. (c) Allow `selectedDrink` to work for Fries (currently blocked by `!isKidsMenu` check, which already passes for Fries). |
| `src/components/staff/StaffProductSheet.tsx` | Same changes |

The drink dropdown already exists and `drinksProducts` is already fetched. The only work is:
1. Add a new conditional section for Fries
2. Include the drink in `buildAllModifiers` for Fries (currently gated by `!isKidsMenu` which already allows Fries)
3. Include drinkPrice in totalPrice calc for Fries (already works since `!isKidsMenu` is true for Fries)

### UI

For a Fries product, after "Customize Your Fries" sauces section:

```
--- Make It Epic (Flame icon) ---
Add a Drink
[ Dropdown: No Drink / Coke +EUR2.00 / Fanta +EUR2.00 / ... ]
```

Same visual styling as the existing Make It Epic section (gradient background, flame icon).

---

## Change 4: Kids Menu +/- Customization Controls

**Current behavior**: Kids Menu items already show the "Customize Your Order" section with +/- buttons for default ingredients (same as Burgers). The ingredient `is_removable` and `is_addable` flags from the DB control which buttons appear.

**What needs to happen**: This largely already works. With Change 1 (EUR 0.50 default extras), kids extras will now correctly charge EUR 0.50 for non-meat/non-cheese items.

The main gap: ensure the pricing legend is shown for Kids Menu items too, and that the UI labels are clear.

### Files changed

| File | Change |
|------|--------|
| `src/components/customer/ProductSheet.tsx` | Add pricing legend below the Kids Menu customize section (same as staff side) |
| `src/components/staff/StaffProductSheet.tsx` | Already has legend -- update "Others FREE" to "Others +EUR0.50" (covered in Change 1) |

### Database prerequisite

Kids Menu products must have ingredients configured in `product_ingredients` with `is_removable = true` and `is_addable = true` for the +/- controls to appear. If they don't already exist, they need to be added. This is a data concern, not a code concern -- the code already handles it.

---

## Shared Helper Addition: `getModifierTotal`

Added to `src/lib/pricingRules.ts`:

```typescript
export function getModifierTotal(mod: { price_adjustment: number; quantity?: number }): number {
  return mod.price_adjustment * (mod.quantity || 1);
}
```

Used in:
- Both cart stores for total calculation
- Both ProductSheet components for live price display
- Cart page for display

---

## Complete File Change Summary

| # | File | Changes |
|---|------|---------|
| 1 | `src/lib/pricingRules.ts` | `defaultExtraPrice: 0.50`, add `getModifierTotal()` helper |
| 2 | `src/types/database.ts` | Add `quantity?: number` to `SelectedModifier` |
| 3 | `src/components/customer/ProductSheet.tsx` | Beef Patty stepper, Fries Make It Epic drink section, pricing legend |
| 4 | `src/components/staff/StaffProductSheet.tsx` | Same as customer (mirrored changes) |
| 5 | `src/stores/cartStore.ts` | Use `getModifierTotal` in price calcs |
| 6 | `src/stores/staffCartStore.ts` | Use `getModifierTotal` in price calcs |
| 7 | `src/pages/Cart.tsx` | Show quantity on modifier badges ("Beef Patty x3") |

No database migrations needed -- the `quantity` field is stored in JSONB (`selected_modifiers`) which accepts any shape.

---

## Backward Compatibility

- Old cart items without `quantity` on modifiers: `getModifierTotal` defaults to `quantity = 1`, so totals are unchanged
- Old items with `price_adjustment: 0` extras: these remain at 0 in the stored data; the EUR 0.50 rule only applies when adding/editing
- KDS rendering: modifiers without `quantity` display as before; those with `quantity > 1` show "x3" suffix
- No changes to order creation payload or database schema

