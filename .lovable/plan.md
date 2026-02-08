
# Add "Make it a Flatbread (+€1)" Bread Swap Feature

## Overview

Add a new paid add-on option "Make it a Flatbread (+€1)" to the "Make It Epic" section for Burgers and Specials categories only. This replaces the standard bun with a flatbread and adds €1 per unit to the order.

---

## Technical Analysis

### Current Architecture

The app already has a well-established modifier system:

1. **SelectedModifier Interface** (`src/types/database.ts` line 96-101):
```typescript
interface SelectedModifier {
  id: string;
  name: string;
  price_adjustment: number;
  modifier_type?: 'loaded_fries_small' | 'drink' | 'sauce' | 'addon' | 'extra';
}
```

2. **"Make It Epic" Section** exists in both:
   - `src/components/customer/ProductSheet.tsx` (lines 416-537)
   - `src/components/staff/StaffProductSheet.tsx` (lines 385-495)

3. **STANDALONE_ADDONS Pattern** - Already established for checkboxes like Beef Patty, Bacon, Cheese, etc. (lines 61-68 in ProductSheet.tsx)

4. **Category Gating** - Already implemented: `showMakeItEpic` excludes Fries, Drinks, and Sauces (line 203)

5. **Pricing** - Uses `price_adjustment` in cents-compatible way, prices stored as euros (€)

---

## Implementation Plan

### Part 1: Update Type Definition

**File: `src/types/database.ts`**

Add new modifier type for bread swaps:

```typescript
modifier_type?: 'loaded_fries_small' | 'drink' | 'sauce' | 'addon' | 'extra' | 'bread_swap';
```

---

### Part 2: Add Flatbread Option to Customer ProductSheet

**File: `src/components/customer/ProductSheet.tsx`**

**A) Add Bread Swap Constant (after KIDS_MENU_ADDONS, around line 74):**

```typescript
// Bread swap option - only for Burgers and Specials
const BREAD_SWAP_FLATBREAD = {
  code: 'BREAD_SWAP_FLATBREAD',
  id: 'bread-swap-flatbread',
  label: 'Make it a Flatbread',
  kitchenLabel: 'FLATBREAD',
  category: 'bread',
  type: 'swap',
  price: 1.00,
};
```

**B) Add State for Bread Swap (around line 91):**

```typescript
const [flatbreadSelected, setFlatbreadSelected] = useState(false);
```

**C) Add Category Check (around line 203):**

```typescript
// Show flatbread option only for Burgers and Specials
const showFlatbreadOption = product.category === 'Burgers' || product.category === 'Specials';
```

**D) Handle Edit Mode - Restore Flatbread State (in useEffect around line 118-130):**

Add logic to detect existing `bread_swap` modifier and set `flatbreadSelected`:

```typescript
} else if (mod.modifier_type === 'bread_swap') {
  // Restore flatbread selection in edit mode
  setFlatbreadSelected(true);
```

**E) Reset Flatbread on Product Change (around line 173):**

```typescript
setFlatbreadSelected(false);
```

**F) Build Flatbread Modifier (in buildAllModifiers function around line 312):**

```typescript
// Add flatbread bread swap if selected
if (flatbreadSelected) {
  allMods.push({
    id: BREAD_SWAP_FLATBREAD.id,
    name: BREAD_SWAP_FLATBREAD.label,
    price_adjustment: BREAD_SWAP_FLATBREAD.price,
    modifier_type: 'bread_swap',
  });
}
```

**G) Include Flatbread in Price Calculation (around line 324):**

```typescript
const flatbreadPrice = flatbreadSelected ? BREAD_SWAP_FLATBREAD.price : 0;

const totalPrice = (product.price + currentAddonsTotal + extrasTotal + modifiersTotal + selectedLoadedFriesPrice + drinkPrice + saucePrice + flatbreadPrice) * quantity;
```

**H) Add UI Toggle in "Make It Epic" Section (after existing add-ons, around line 455):**

Insert a new visually distinct bread swap section:

```tsx
{/* Bread Swap Option - Only for Burgers & Specials */}
{showFlatbreadOption && (
  <div className="mt-4 pt-4 border-t border-white/10">
    <label
      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
        flatbreadSelected
          ? 'border-amber-500 bg-amber-500/15 shadow-sm shadow-amber-500/20'
          : 'border-white/10 bg-white/5 hover:border-amber-500/40'
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={flatbreadSelected}
            onCheckedChange={(checked) => setFlatbreadSelected(checked === true)}
            className="border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
          />
          <span className="text-foreground font-medium">Make it a Flatbread</span>
        </div>
        <span className="text-xs text-muted-foreground ml-9">Replaces the standard bun</span>
      </div>
      <span className="text-amber-400 font-bold">+€1.00</span>
    </label>
  </div>
)}
```

---

### Part 3: Add Flatbread Option to Staff ProductSheet

**File: `src/components/staff/StaffProductSheet.tsx`**

Apply identical changes:
- Add `BREAD_SWAP_FLATBREAD` constant
- Add `flatbreadSelected` state
- Add `showFlatbreadOption` category check
- Handle edit mode restoration
- Add to `buildAllModifiers()`
- Include in price calculation
- Add UI toggle in "Make It Epic" section

---

### Part 4: Update Cart Display

**File: `src/pages/Cart.tsx`**

Update the modifier badge rendering to give `bread_swap` modifiers a distinct visual treatment (amber/bold styling):

In the modifiers section (around line 199-207), update to:

```tsx
{item.selectedModifiers.map((m) => {
  // Special styling for bread swap modifiers
  const isBreadSwap = m.modifier_type === 'bread_swap';
  
  return (
    <span 
      key={m.id} 
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
        isBreadSwap 
          ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
          : 'bg-green-500/20 text-green-400 border border-green-500/30'
      }`}
    >
      {isBreadSwap ? m.name : `+ ${m.name}`}
      {m.price_adjustment > 0 && ` (+€${m.price_adjustment.toFixed(2)})`}
    </span>
  );
})}
```

---

### Part 5: Update Kitchen Display System

**File: `src/components/staff/KitchenDisplaySystem.tsx`**

The KDS already parses modifiers from the `selected_modifiers` JSONB field and displays them. The `bread_swap` type will be included in `regularModifiers` and displayed. 

For enhanced visibility, update the modifier rendering in the `parseModifiers` function or display logic (around line 339-346) to give bread swaps prominent amber styling:

```tsx
{parsed.regularModifiers.map((mod, i) => {
  const isBreadSwap = mod.name?.toLowerCase().includes('flatbread');
  return (
    <span
      key={`mod-${i}`}
      className={`text-xs px-1.5 py-0.5 rounded font-bold ${
        isBreadSwap
          ? 'bg-amber-500/40 text-amber-200'
          : 'bg-secondary text-muted-foreground'
      }`}
    >
      {isBreadSwap ? `BREAD: ${mod.name.toUpperCase()}` : mod.name}
      {mod.price_adjustment && mod.price_adjustment > 0 && ` (+€${mod.price_adjustment.toFixed(2)})`}
    </span>
  );
})}
```

---

### Part 6: Verify Checkout/Webhook Payload

**File: `src/hooks/useCheckout.ts`**

The existing `submitOrder` function (lines 93-118) already includes all modifiers in the order_items JSONB. The flatbread modifier will be included automatically:

```typescript
selected_modifiers: {
  modifiers: regularModifiers.map((m) => ({
    name: m.name,
    price_adjustment: m.price_adjustment,
  })),
  // ...
}
```

For n8n webhooks (`sendToKitchen` around line 192-195), modifiers are already appended:

```typescript
item.selectedModifiers.forEach((mod) => {
  if (mod?.name) modifiers.push(mod.name);
});
```

**Enhancement**: To include the structured data for external systems, we can update the payload to include full modifier objects:

```typescript
modifiers: item.selectedModifiers.map(mod => ({
  name: mod.name,
  code: mod.id,
  price: mod.price_adjustment,
  type: mod.modifier_type || 'unknown'
})),
```

---

## Summary of Changes

| File | Changes |
|------|---------|
| `src/types/database.ts` | Add `'bread_swap'` to `modifier_type` union |
| `src/components/customer/ProductSheet.tsx` | Add flatbread constant, state, category gating, UI toggle, build modifier, price calc |
| `src/components/staff/StaffProductSheet.tsx` | Same changes as customer ProductSheet |
| `src/pages/Cart.tsx` | Enhanced modifier display with amber styling for bread swaps |
| `src/components/staff/KitchenDisplaySystem.tsx` | Enhanced modifier display for bread swaps |
| `src/hooks/useCheckout.ts` | (Optional) Enhance webhook payload with full modifier objects |

---

## Modifier Schema (Final)

```typescript
{
  id: 'bread-swap-flatbread',
  name: 'Make it a Flatbread',
  price_adjustment: 1.00,
  modifier_type: 'bread_swap',
  // Additional metadata (for reference, not stored in modifier):
  // code: 'BREAD_SWAP_FLATBREAD',
  // kitchenLabel: 'FLATBREAD',
  // category: 'bread',
  // type: 'swap',
}
```

---

## Category Scoping Logic

```typescript
// Only Burgers and Specials get the flatbread option
const showFlatbreadOption = product.category === 'Burgers' || product.category === 'Specials';
```

Uses the existing `ProductCategory` type which includes: `'Burgers' | 'Flatbreads' | 'Fries' | 'Drinks' | 'Specials' | 'Sauces' | 'Kids Menu'`

---

## Validation & Edge Cases

1. **Duplicate Prevention**: Only one flatbread modifier can exist per item (single checkbox toggle)
2. **Edit Mode**: Flatbread state is restored from existing modifiers when editing cart items
3. **Quantity Scaling**: Price is included in `totalPrice` calculation which is multiplied by quantity
4. **Type Switching**: Not applicable - flatbread is tied to the product, not selectable between bread types
5. **Mutual Exclusivity**: Currently only one bread swap option (flatbread). Future bread options would use the same `bread_swap` type and require only one to be selected

---

## Manual QA Checklist

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Open a Burger product → Look for flatbread option | Should see "Make it a Flatbread (+€1)" toggle in Make It Epic section |
| 2 | Open a Specials product → Look for flatbread option | Should see flatbread toggle |
| 3 | Open a Fries product → Look for flatbread option | Should NOT see flatbread toggle |
| 4 | Open a Kids Menu product → Look for flatbread option | Should NOT see flatbread toggle |
| 5 | Toggle flatbread ON → Check price | Price should increase by €1 |
| 6 | Toggle flatbread OFF → Check price | Price should decrease by €1 |
| 7 | Add item with flatbread to cart → View cart | Should see "Make it a Flatbread (+€1)" badge in amber/bold styling |
| 8 | Change quantity to 2 → Check total | Flatbread charge should scale (2x €1 = €2 increase) |
| 9 | Edit item in cart → Check toggle state | Flatbread toggle should be pre-selected |
| 10 | Complete checkout → Check kitchen display | Should see "BREAD: FLATBREAD (+€1.00)" in order details |

---

## Migration Notes

**No database migration required.** The flatbread modifier is stored in the existing `selected_modifiers` JSONB column in `order_items`. The structure is:

```json
{
  "modifiers": [
    { "name": "Make it a Flatbread", "price_adjustment": 1.0 }
  ],
  "removed_ingredients": [],
  "added_extras": []
}
```

The new `modifier_type: 'bread_swap'` is only used client-side for UI rendering and is not persisted to the database (matching existing patterns for other modifier types).
