

# Dual-Status Inventory Logic: Out of Stock vs. Available

## Overview

This plan refactors the product availability system to support **two distinct controls**:

| Control | Effect on User Menu | Effect on Staff POS |
|---------|---------------------|---------------------|
| **Is Available** = OFF | Completely hidden | Completely hidden |
| **Is Sold Out** = ON | Visible but grayed out + unclickable | Visible but grayed out + unclickable |

---

## Current State Analysis

### Database Schema
The `products` table currently has a single boolean field:
- `is_available` (boolean, default: true)

### Current Behavior
- `is_available = false` → Product is grayed out with "SOLD OUT" overlay
- Products are **never hidden** - they're always shown in all views

### Problem
There's no way to:
1. Completely hide a product from menus (seasonal items, discontinued)
2. Show a product as sold out (visible but unorderable)

---

## Solution Architecture

### Step 1: Database Migration

Add a new column `is_sold_out` to the products table:

```sql
ALTER TABLE products 
ADD COLUMN is_sold_out BOOLEAN DEFAULT false;

COMMENT ON COLUMN products.is_sold_out IS 
  'When true, item is visible but grayed out and unclickable (temporary out of stock)';

COMMENT ON COLUMN products.is_available IS 
  'When false, item is completely hidden from all menus (discontinued/seasonal)';
```

### Step 2: Update TypeScript Types

**File: `src/types/database.ts`**

```typescript
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: ProductCategory;
  image_url: string | null;
  is_available: boolean;    // Hidden from menus when false
  is_sold_out: boolean;     // Grayed out when true (NEW)
  is_featured: boolean;
  stock_count: number;
  created_at: string;
  updated_at: string;
}
```

### Step 3: Update Product Fetching Logic

**File: `src/hooks/useProducts.ts`**

For **Customer-facing** menus, filter out hidden products:

```typescript
// Add filter for customer menus - only show available products
const { data, error } = await query.eq('is_available', true);
```

Create a separate hook for **Staff Stock Manager** (shows all products):

```typescript
export function useAllProducts() {
  // Returns ALL products including hidden ones
  // Used only by Stock Manager
}
```

### Step 4: Update Product Cards

**File: `src/components/customer/ProductCardHorizontal.tsx`**

Update the sold-out logic to use the new field:

```typescript
// Before:
const isSoldOut = !product.is_available;

// After:
const isSoldOut = product.is_sold_out;
```

**File: `src/components/staff/StaffPOSContent.tsx`**

Filter products and show sold-out state:

```typescript
// Filter: only show available products (is_available = true)
const visibleProducts = products.filter(p => p.is_available);

// For each product, check is_sold_out for grayed-out state
const isSoldOut = product.is_sold_out;
```

### Step 5: Upgrade Stock Manager UI

**File: `src/components/staff/OperationsContent.tsx`**

Replace the single toggle with **two distinct controls**:

```text
┌─────────────────────────────────────────────────────────┐
│ Classic Smash Burger                        €12.50     │
│ [▼ Burgers]                                            │
│ ┌──────────────────────────────────────────────────┐   │
│ │ ⚠ SOLD OUT     [toggle]  │  👁 VISIBLE  [toggle] │   │
│ └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Toggle Behaviors:**
- **SOLD OUT** toggle (amber/orange): `is_sold_out` field
  - ON = grayed out on menus, unclickable
  - OFF = normal display
  
- **VISIBLE** toggle (green/gray): `is_available` field  
  - ON = shown on menus
  - OFF = completely hidden

**Visual States in Stock Manager:**

| State | Row Appearance |
|-------|----------------|
| Normal (visible + in stock) | Default styling |
| Sold Out (visible + OOS) | Orange border, "SOLD OUT" badge |
| Hidden (not visible) | Gray background, "HIDDEN" badge |
| Hidden + Sold Out | Gray bg + "HIDDEN" badge (OOS irrelevant when hidden) |

---

## File Changes Summary

| File | Changes |
|------|---------|
| **Database** | Add `is_sold_out BOOLEAN DEFAULT false` column |
| `src/types/database.ts` | Add `is_sold_out: boolean` to Product interface |
| `src/hooks/useProducts.ts` | Filter `is_available = true` for customer queries; add `useAllProducts()` hook |
| `src/components/customer/ProductCardHorizontal.tsx` | Use `is_sold_out` instead of `!is_available` |
| `src/components/customer/MenuSection.tsx` | Products already filtered by hook |
| `src/components/staff/StaffPOSContent.tsx` | Filter visible products, gray out sold-out items |
| `src/components/staff/OperationsContent.tsx` | Two toggle switches per product row |

---

## Technical Details

### New Handler Functions in OperationsContent

```typescript
const handleSoldOutToggle = async (productId: string, isSoldOut: boolean) => {
  const { error } = await supabase
    .from('products')
    .update({ is_sold_out: isSoldOut })
    .eq('id', productId);
    
  if (!error) {
    refetchProducts();
    toast.success(isSoldOut ? 'Marked as sold out' : 'Back in stock');
  }
};

const handleVisibilityToggle = async (productId: string, isAvailable: boolean) => {
  const { error } = await supabase
    .from('products')
    .update({ is_available: isAvailable })
    .eq('id', productId);
    
  if (!error) {
    refetchProducts();
    toast.success(isAvailable ? 'Now visible on menu' : 'Hidden from menu');
  }
};
```

### Realtime Sync (Already Implemented)

The existing realtime subscription in `useProducts.ts` already handles this:

```typescript
const channel = supabase
  .channel('products-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, 
    () => queryClient.invalidateQueries({ queryKey: ['products'] })
  )
  .subscribe();
```

When staff toggles either switch, changes propagate instantly to:
- Staff POS (Tab 1)
- Customer Menu (mobile phones)
- Other Stock Manager instances

---

## Expected Result

### Stock Manager Row Layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ Classic Smash                               €12.50        ✏️   │
│ [▼ Burgers]                                                     │
│                                                                 │
│   ⚠ SOLD OUT  [●────]      👁 VISIBLE  [────●]                 │
│     (amber)                   (green)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Customer Menu Behavior

- `is_available = false` → Product not rendered at all
- `is_available = true, is_sold_out = true` → Grayed out, "SOLD OUT" overlay, unclickable
- `is_available = true, is_sold_out = false` → Normal display

### Staff POS Behavior

- Same as customer menu (only shows available products)
- Sold out items visible but grayed/unclickable

