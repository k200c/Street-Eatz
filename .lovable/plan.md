

# Menu Update: Remove Burger & Add New Sauces

## Overview

This plan addresses your request to:
1. Remove the "Smoked Cheese Burger" (without chips) from the menu
2. Add 4 new sauces at €1.50 each
3. Ensure sauces appear in the "Make It Epic" dropdown

---

## Current Database State

### Burgers with "Smoked Cheese":

| Name | Has Chips? | Price | Status |
|------|-----------|-------|--------|
| Applewood Double Smash Cheeseburger | Yes (in description) | €12.50 | Available |
| Smoked Applewood Double Smash Cheeseburger | No | €11.50 | Already unavailable |
| The Smoked Cheese Double Cheeseburger | No | €12.50 | Already unavailable |

**Note:** Both "Smoked Cheese" burgers without chips are already marked as unavailable (`is_available = false`). If you want them permanently removed from the database, we can delete them. Otherwise, they're already hidden from customers.

### Current Sauces:

| Name | Price | Status |
|------|-------|--------|
| BBQ Sauce | €1.50 | Available |
| Garlic Aioli | €1.50 | Available |
| Chipotle Mayo | €0.75 | Unavailable |
| Hot Sauce | €1.50 | Unavailable |
| Ranch | €1.50 | Unavailable |

---

## Solution

### Step 1: Remove Burger (Database Migration)

Delete the burger(s) without chips from the products table. Based on descriptions:
- "Smoked Applewood Double Smash Cheeseburger" has no chips mentioned
- "The Smoked Cheese Double Cheeseburger" has no chips mentioned

```sql
DELETE FROM products 
WHERE id IN (
  '12a139ea-321c-4d6e-b64b-8b02c647ddf4',  -- Smoked Applewood Double Smash
  'e790a6c6-01ff-4cb6-a015-445cc11f326c'   -- The Smoked Cheese Double
);
```

**Alternative:** If you only want to hide (not delete), we can set `is_available = false` (but they're already hidden).

---

### Step 2: Add New Sauces (Database Migration)

Insert 4 new sauce products into the products table:

```sql
INSERT INTO products (name, description, price, category, is_available, is_featured) VALUES
  ('Jerk Mayonnaise', 'Caribbean-inspired spicy mayo with warm jerk spices', 1.50, 'Sauces', true, false),
  ('Curry Mayonnaise', 'Creamy mayo blended with aromatic curry spices', 1.50, 'Sauces', true, false),
  ('Mojo Picon Sauce', 'Spanish taco-style sauce with smoky peppers and cumin', 1.50, 'Sauces', true, false),
  ('Burger Sauce', 'Our signature house burger sauce', 1.50, 'Sauces', true, false);
```

---

### Step 3: UI Reflection (Automatic)

No code changes needed! The "Add a Sauce" dropdown in the "Make It Epic" section uses the `useSauces()` hook, which automatically fetches all products where:
- `category = 'Sauces'`
- `is_available = true`

Once the new sauces are inserted, they will immediately appear in the dropdown.

---

## Summary

| Action | Method | Impact |
|--------|--------|--------|
| Remove smoked cheese burgers (no chips) | Database DELETE | 2 products permanently removed |
| Add 4 new sauces | Database INSERT | 4 new sauce products at €1.50 each |
| Update UI | None needed | `useSauces()` hook auto-fetches available sauces |

---

## Expected Result

After implementation, the "Add a Sauce" dropdown will show:
- BBQ Sauce (+€1.50)
- Burger Sauce (+€1.50)
- Curry Mayonnaise (+€1.50)
- Garlic Aioli (+€1.50)
- Jerk Mayonnaise (+€1.50)
- Mojo Picon Sauce (+€1.50)

