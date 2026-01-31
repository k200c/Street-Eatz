
# Menu Customization Update: Fries Add-ons & Kids Burger Ingredients

## Overview

This update adds two customization features:
1. **Regular Fries (Handcut Chips)**: Enable a simplified "Customize Your Fries" section with paid sauce add-ons
2. **Kids Burgers**: Add default removable ingredients (Lettuce, Onion, Pickles) that appear below the Kids "Make It Epic" section

---

## Current State Analysis

| Item | Category | Current Behavior |
|------|----------|------------------|
| Handcut Chips (€3.50) | Fries | No customization section shown (hidden by `showMakeItEpic` logic) |
| Kids Cheeseburger (€6.00) | Kids Menu | Only shows Chips/Capri Sun add-ons, no ingredients |
| Smash Burger Plain (€5.50) | Kids Menu | Only shows Chips/Capri Sun add-ons, no ingredients |

**Existing Ingredient IDs in Database:**
- Lettuce: `3571bc99-4db1-4f0f-adf6-c702383fdcf9`
- Onions: `0eae9511-dd26-4be6-8d25-7ab991cb881f`
- Pickles: `06abfb8a-4593-4d67-b571-dd5b007937e9`
- Garlic Aioli: `a10056b1-645f-41b6-bf35-9ee69c2ceccb`
- Cheese Sauce: `ab4ea416-d4f2-460a-8e57-6aadceecfe49`

---

## Implementation Plan

### 1. Database Migration

Insert the required `product_ingredients` records to link ingredients to products.

**Kids Burgers - Default Removable Ingredients:**
```sql
-- Kids Cheeseburger (39852f78-69d9-4d80-bd65-54ca2f2c1b31)
INSERT INTO product_ingredients (product_id, ingredient_id, is_default, is_removable, is_addable)
VALUES 
  ('39852f78-69d9-4d80-bd65-54ca2f2c1b31', '3571bc99-4db1-4f0f-adf6-c702383fdcf9', true, true, false), -- Lettuce
  ('39852f78-69d9-4d80-bd65-54ca2f2c1b31', '0eae9511-dd26-4be6-8d25-7ab991cb881f', true, true, false), -- Onions
  ('39852f78-69d9-4d80-bd65-54ca2f2c1b31', '06abfb8a-4593-4d67-b571-dd5b007937e9', true, true, false); -- Pickles

-- Smash Burger Plain (c64610a8-2031-4b7d-abec-5dcbcca4cf6f)
INSERT INTO product_ingredients (product_id, ingredient_id, is_default, is_removable, is_addable)
VALUES 
  ('c64610a8-2031-4b7d-abec-5dcbcca4cf6f', '3571bc99-4db1-4f0f-adf6-c702383fdcf9', true, true, false), -- Lettuce
  ('c64610a8-2031-4b7d-abec-5dcbcca4cf6f', '0eae9511-dd26-4be6-8d25-7ab991cb881f', true, true, false), -- Onions
  ('c64610a8-2031-4b7d-abec-5dcbcca4cf6f', '06abfb8a-4593-4d67-b571-dd5b007937e9', true, true, false); -- Pickles

-- Handcut Chips - Fries Add-ons (4ed71daf-5832-4f73-8690-dde2cd390e21)
-- These are NOT default ingredients, but ADDABLE extras with custom pricing
INSERT INTO product_ingredients (product_id, ingredient_id, is_default, is_removable, is_addable)
VALUES 
  ('4ed71daf-5832-4f73-8690-dde2cd390e21', 'a10056b1-645f-41b6-bf35-9ee69c2ceccb', false, false, true), -- Garlic Aioli (add-on)
  ('4ed71daf-5832-4f73-8690-dde2cd390e21', 'ab4ea416-d4f2-460a-8e57-6aadceecfe49', false, false, true); -- Cheese Sauce (add-on)
```

### 2. Update Pricing Rules

Add Garlic Aioli and Cheese Sauce to the pricing logic in `src/lib/pricingRules.ts`:

```typescript
// Add new sauce keywords with €1.00 pricing
sauceKeywords: ['aioli', 'cheese sauce'],
saucePrice: 1.00,
```

Update the `getExtraPrice()` function to check for sauces.

### 3. Update ProductSheet.tsx (Customer UI)

**Changes Required:**

1. **Add "Customize Your Fries" section for Regular Fries:**
   - Create a new conditional block for `category === 'Fries'` products that have addable ingredients
   - Display addable ingredients (Garlic Aioli, Cheese Sauce) as checkboxes with +€1.00 pricing
   - Use a simpler header: "Customize Your Fries" instead of "Make It Epic"

2. **Show Ingredients section for Kids Menu:**
   - Currently, the ingredients section is shown for all products with `hasIngredients`
   - This will automatically work once the database records are inserted
   - The ingredients will appear BELOW the Kids "Make It Epic" section

**UI Flow for Fries:**
```text
┌────────────────────────────────────┐
│  HANDCUT CHIPS - €3.50             │
│  ─────────────────────────────────  │
│  🍟 Customize Your Fries           │
│  ─────────────────────────────────  │
│  ☐ Garlic Aioli         +€1.00    │
│  ☐ Cheese Sauce         +€1.00    │
│  ─────────────────────────────────  │
│  [  ADD TO ORDER · €3.50  ]        │
└────────────────────────────────────┘
```

**UI Flow for Kids Burger:**
```text
┌────────────────────────────────────┐
│  KIDS CHEESEBURGER - €6.00         │
│  ─────────────────────────────────  │
│  🔥 Make It Epic                   │
│  ☐ Add Chips           +€2.00     │
│  ☐ Capri Sun           +€1.50     │
│  ─────────────────────────────────  │
│  Customize Your Order              │
│  [Lettuce         ][−]            │
│  [Onions          ][−]            │
│  [Pickles         ][−]            │
│  ─────────────────────────────────  │
│  [  ADD TO ORDER · €6.00  ]        │
└────────────────────────────────────┘
```

### 4. Update StaffProductSheet.tsx (Staff POS UI)

Apply the same logic changes for consistency:
- Enable "Customize Your Fries" for Fries category
- Add Kids Menu to category images
- Show ingredients for Kids Menu items

### 5. Allergen Updates

The allergen numbers for the add-on sauces need to be documented for staff reference:
- **Garlic Aioli**: Contains Eggs (3) - allergen number 3
- **Cheese Sauce**: Contains Milk (7), possibly Gluten (1) depending on recipe

*Note: These are add-ons, not products, so they don't have their own product_allergens records. Consider adding a tooltip or note when selected.*

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/pricingRules.ts` | Add sauce keywords with €1.00 pricing |
| `src/components/customer/ProductSheet.tsx` | Add Fries customization section, ensure Kids Menu shows ingredients |
| `src/components/staff/StaffProductSheet.tsx` | Mirror changes for Staff POS consistency |

**Database Migration:**
- Insert 8 new `product_ingredients` records

---

## Cart Display Logic

When a user removes an ingredient, the cart will show:
- "No Lettuce", "No Onions", "No Pickles" (in red)

When a user adds a fries add-on, the cart will show:
- "+ Garlic Aioli (+€1.00)" (in green)

This information will be passed to the Kitchen Display System for accurate order preparation.

---

## Technical Details

### Ingredient State Flow for Kids Burgers

```text
1. User opens Kids Cheeseburger sheet
2. useProductIngredients(productId) fetches Lettuce, Onions, Pickles
3. ingredientStates initialized: { lettuce: 'included', onions: 'included', pickles: 'included' }
4. User toggles OFF "Onions" → ingredientStates: { ..., onions: 'removed' }
5. On "Add to Order":
   - getRemovedIngredients() returns [{ id: '...', name: 'Onions' }]
   - Cart displays: "No Onions"
```

### Fries Add-on Flow

```text
1. User opens Handcut Chips sheet
2. useProductIngredients(productId) fetches Garlic Aioli (is_addable: true), Cheese Sauce (is_addable: true)
3. New "Customize Your Fries" section displays addable ingredients as checkboxes
4. User checks "Garlic Aioli" → ingredientStates: { aioli: 'extra' }
5. On "Add to Order":
   - getExtraIngredients() returns [{ id: '...', name: 'Extra Garlic Aioli', price_adjustment: 1.00 }]
   - Total: €3.50 + €1.00 = €4.50
```

---

## Expected Outcome

After implementation:
- **Handcut Chips** will have a "Customize Your Fries" section with Garlic Aioli (+€1.00) and Cheese Sauce (+€1.00) as selectable add-ons
- **Kids Cheeseburger** and **Smash Burger Plain** will display Lettuce, Onions, and Pickles as default ON ingredients that can be toggled OFF
- Kitchen orders will correctly show "No Onion", "No Pickles", etc. for removed items
- All pricing calculations will update dynamically in the cart
