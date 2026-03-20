

# Kids Menu Fix: Beef Patty Stepper + Mayo Visibility

## Analysis Summary

**Mayo issue — confirmed root cause**: Mayo on Kids burgers has `is_default=false, is_addable=true`. The ingredient list is split into two groups:
- `defaultIngredients` (`is_default=true`) → renders in "Customize Your Order" section
- `addableOnlyIngredients` (`is_addable=true, is_default=false`) → renders ONLY in "Customize Your Fries" section (gated by `product.category === 'Fries'`)

So for Kids Menu burgers, Mayo has **no render path at all**. The user's report that "mayo is visible in ingredients" may have been from a different product or a misunderstanding. The code proves it cannot render for Kids burgers currently.

**Beef patty stepper** — `!isKidsMenu` blocks it. Already diagnosed.

**Beef patty price** — `Dry-aged beef patties` needs `addon_price_kids = 2.50`.

## Changes (4 items)

### 1. Database: Fix `Dry-aged beef patties` price
```sql
UPDATE public.ingredients
SET addon_price_kids = 2.50
WHERE id = 'c404b4c5-0763-4720-b3cf-ca5cf4a4e7d5'
  AND name = 'Dry-aged beef patties';
```

### 2. `src/components/customer/ProductSheet.tsx` — 2 changes

**Line 211** — Enable beef patty stepper for Kids Menu:
```
const showBeefPattyStepper = showMakeItEpic && product.category !== 'Flatbreads';
```

**After the Fries Customization section (after line 695)** — Add an "Add Extras" section for non-Fries products that have addable-only ingredients (like Mayo on Kids burgers):
```tsx
{!showFriesCustomization && hasAddableIngredients && (
  <div className="mb-8">
    <h4 className="font-heading text-sm uppercase tracking-wider text-foreground mb-4">
      Add Extras
    </h4>
    <div className="space-y-2">
      {addableOnlyIngredients.map((ingredient) => {
        // Checkbox UI using existing handleAddExtra + ingredientStates
        // Shows price via getIngredientAddonPrice (€0.00 for Mayo on Kids)
        // Displays "FREE" for zero-price items, "+€X.XX" for paid
      })}
    </div>
  </div>
)}
```

This is a generic solution — any future addable-only ingredient on any non-Fries product will automatically appear. Mayo flows into `getExtraIngredients()` → `buildAllModifiers()` → cart → order payload. No hardcoding.

### 3. `src/components/staff/StaffProductSheet.tsx` — Same 2 changes

**Line 202** — Same beef patty stepper fix.

**After Fries Customization section** — Same "Add Extras" section.

### 4. No other files changed

Cart store, pricing rules, order payload, checkout, hooks, edge functions — all untouched. The existing `buildAllModifiers()` already includes `getExtraIngredients()` output, so mayo will flow through the entire pipeline once it's selectable in the UI.

## What this fixes
- Mayo becomes visible and selectable on Kids Cheeseburger and Kids Smashburger Plain
- Mayo selection flows to cart (as a `selectedModifier` with `price_adjustment: 0`)
- Mayo appears in cart page summary (Cart.tsx already renders all `selectedModifiers`)
- Beef patty stepper appears in Make It Epic for Kids burgers at €2.50 each
- Staff POS has the same fixes

## What is NOT changed
- Adult burger customization — unchanged
- Fries customization section — unchanged
- Cart logic, pricing rules, order payload — unchanged
- Checkout, payment, edge functions — unchanged

