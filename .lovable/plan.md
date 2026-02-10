
# Staff POS iPad Optimization: 3-Part Update

## Summary

Three targeted updates to the Staff POS used on iPad: (1) enlarge all touch targets via a centralized CSS system, (2) add a "Delivery" view filter with Just Eat/Delivery sub-options, (3) increase receipt/order summary text sizes. There is no HTML/thermal print receipt system in the codebase -- receipts exist only as on-screen order summaries in the checkout modals and KDS, so "receipt text" changes apply to those components.

---

## Part 1: Staff POS Touch Target Scale System

### Approach

Add CSS custom properties under a `.staff-pos` wrapper class in `src/index.css`. All staff-facing pages (`StaffDashboard`, `StaffPOS`, `StaffPOSQuick`, `CommandCenter`) will apply this wrapper at their root element. This keeps the scale system centralized and does not affect customer-facing UI.

### CSS Variables (added to `src/index.css`)

```css
/* Staff POS Scale System -- iPad touch optimization */
.staff-pos {
  --pos-btn-min-h: 52px;
  --pos-btn-padding: 14px 20px;
  --pos-btn-font: 15px;
  --pos-icon-size: 20px;
  --pos-card-padding: 16px;
  --pos-input-height: 52px;
  --pos-gap: 12px;
}
```

### Files Changed

| File | What Changes |
|------|-------------|
| `src/index.css` | Add `.staff-pos` class with CSS variables and descendant selectors |
| `src/pages/StaffDashboard.tsx` | Add `staff-pos` class to root div |
| `src/pages/StaffPOS.tsx` | Add `staff-pos` class to root div |
| `src/pages/StaffPOSQuick.tsx` | Add `staff-pos` class to root div |
| `src/pages/CommandCenter.tsx` | Add `staff-pos` class to root div |
| `src/components/staff/StaffPOSContent.tsx` | Increase product card height from h-24 to h-28, edit/quantity button sizes from w-7/h-7 to w-9/h-9, icon sizes from w-3 to w-4, category tabs from h-12 to h-14 |
| `src/components/staff/StaffProductSheet.tsx` | Increase checkbox/toggle row padding from p-2.5 to p-3.5, quantity buttons from h-9/w-9 to h-11/w-11, "Add to Order" button from h-12 to h-14, ingredient +/- buttons from w-7/h-7 to w-9/h-9 |
| `src/components/staff/KitchenDisplaySystem.tsx` | Increase KDS action buttons from `size="sm"` to larger padding, kanban column header padding |
| `src/components/staff/OperationsContent.tsx` | Increase stock toggle areas, edit button, search input heights |
| `src/components/checkout/StaffCheckoutModal.tsx` (both files) | Increase payment buttons, quick-amount buttons from h-12 to h-14, tab triggers |
| `src/components/staff/StaffPaymentModal.tsx` | Increase payment buttons from h-12 to h-14, quick-amount buttons |
| `src/components/staff/QuickPayModal.tsx` | Increase confirm/cancel buttons |
| `src/components/staff/PickupOrderCard.tsx` | Increase "Take Payment" button |

### Before/After Summary

| Element | Before | After |
|---------|--------|-------|
| Category tabs | h-12 (48px) | h-14 (56px) |
| Product grid cards | h-24 (96px) | h-28 (112px) |
| Cart quantity +/- buttons | w-7 h-7 (28px) | w-9 h-9 (36px) |
| Cart edit button | p-1.5 | p-2.5, min w-9/h-9 |
| KDS action buttons | size="sm" (32px) | h-12, larger padding |
| Checkout quick amounts | h-12 | h-14 |
| Product sheet checkboxes | p-2.5 row | p-3.5 row |
| Product sheet qty buttons | h-9 w-9 | h-11 w-11 |
| "Add to Order" / "Checkout" | h-12 / h-14 | h-14 / h-16 |

---

## Part 2: Delivery View Filter

### Data Analysis

The current `orders` table has no `order_channel` or `order_source` column in the database. The `order_source` field is only sent in webhook payloads (not stored in DB). To support filtering by delivery channel, we need to add an `order_channel` column.

### Database Migration

Add a text column `order_channel` to the `orders` table with a default of `'in_store'`:

```sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_channel text DEFAULT 'in_store';

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_orders_order_channel
  ON public.orders (order_channel);
```

Supported values: `in_store`, `collection`, `delivery`, `justeat`

### UI Implementation

Add a "View" dropdown menu to the StaffPOSContent (POS tab) and/or the KDS header. This will be a simple filter segmented control or dropdown:

**Location**: In `StaffPOSContent.tsx` -- add a "View" dropdown at the top of the cart panel, or in the KDS header area in `KitchenDisplaySystem.tsx`.

**UX Flow** (2 taps max):
1. Tap "View: All Orders" button in the KDS header
2. A dropdown/popover opens with options: "All Orders", "In-Store", "Collection", "Delivery", "Just Eat"
3. Selecting one filters the KDS kanban columns

**Implementation**:

| File | What Changes |
|------|-------------|
| `src/types/database.ts` | Add `OrderChannel` type: `'in_store' \| 'collection' \| 'delivery' \| 'justeat'` |
| `src/hooks/useKitchenOrders.ts` | Add optional `orderChannel` filter parameter to the query; update `KitchenOrder` interface |
| `src/components/staff/KitchenDisplaySystem.tsx` | Add order channel filter state and dropdown in the KDS header, filter orders by `order_channel` |
| `src/hooks/useStaffCheckout.ts` | Include `order_channel: 'in_store'` in staff order inserts |
| `src/hooks/useCheckout.ts` | Include `order_channel: 'collection'` in customer order inserts (default for web orders) |

**How Filtering Maps to Data**:
- "All Orders": No filter (show everything)
- "In-Store": `order_channel = 'in_store'` -- POS-created orders
- "Collection": `order_channel = 'collection'` -- web orders for pickup
- "Delivery": `order_channel = 'delivery'` -- own delivery orders
- "Just Eat": `order_channel = 'justeat'` -- Just Eat orders

Note: Since Just Eat/Delivery orders don't yet originate from anywhere in the current system, these filters will show "No orders" initially. The infrastructure will be ready for when those order sources are connected via webhook/integration.

---

## Part 3: Receipt/Order Summary Text Size Increase

### Current State

There is **no HTML print template or ESC/POS receipt system** in the codebase. The "receipt" is the on-screen order summary displayed in:

1. **KDS Order Cards** (`KitchenDisplaySystem.tsx`) -- the kitchen-facing order view
2. **Staff Checkout Modal** (`StaffCheckoutModal.tsx` in `staff/`) -- order summary during checkout
3. **Pickup Order Card** (`PickupOrderCard.tsx`) -- pending pickup orders
4. **Staff Payment Modal** (`StaffPaymentModal.tsx`) -- payment capture view

These are the "receipts" staff read during service, so they need to be bigger and more readable on iPad.

### Changes

| Element | Before | After |
|---------|--------|-------|
| **KDS: Order number** | `text-lg` (18px) | `text-2xl` (24px) |
| **KDS: Item name** | `font-medium` (default ~16px) | `text-base font-bold` (16px bold) |
| **KDS: Quantity badge** | `text-sm` (14px) | `text-base` (16px) |
| **KDS: Modifier tags** | `text-xs` (12px) | `text-sm` (14px) |
| **KDS: Total** | `text-sm / font-bold` | `text-base / font-bold` |
| **KDS: Customer name** | `text-sm` | `text-base font-bold` |
| **KDS: Special notes** | `text-sm` | `text-base` |
| **Checkout: Order total** | `text-4xl` | `text-5xl` |
| **Checkout: Item names** | `text-sm` | `text-base` |
| **Checkout: Modifier tags** | `text-xs` | `text-sm` |
| **Pickup: Order number** | `text-3xl` | `text-4xl` |
| **Pickup: Item name** | `font-medium` | `text-base font-bold` |
| **Payment: Total** | `text-5xl` | `text-6xl` |

### Files Changed

| File | What Changes |
|------|-------------|
| `src/components/staff/KitchenDisplaySystem.tsx` | Increase font sizes for order number, items, modifiers, customer name, total, and special notes |
| `src/components/staff/StaffCheckoutModal.tsx` (staff version) | Increase order summary text sizes |
| `src/components/staff/PickupOrderCard.tsx` | Increase order number, item, and total sizes |
| `src/components/staff/StaffPaymentModal.tsx` | Increase total display size |

---

## Implementation Order

1. Add `.staff-pos` CSS class and variables to `src/index.css`
2. Apply `.staff-pos` class to all staff page root elements
3. Update touch targets in all staff components (Part 1)
4. Run database migration to add `order_channel` column (Part 2)
5. Add `OrderChannel` type and update hooks (Part 2)
6. Add KDS order channel filter dropdown (Part 2)
7. Increase text sizes in KDS/checkout/receipt components (Part 3)

---

## Technical Details

### Files Modified (Complete List)

| # | File | Parts |
|---|------|-------|
| 1 | `src/index.css` | 1 |
| 2 | `src/pages/StaffDashboard.tsx` | 1 |
| 3 | `src/pages/StaffPOS.tsx` | 1 |
| 4 | `src/pages/StaffPOSQuick.tsx` | 1 |
| 5 | `src/pages/CommandCenter.tsx` | 1 |
| 6 | `src/components/staff/StaffPOSContent.tsx` | 1 |
| 7 | `src/components/staff/StaffProductSheet.tsx` | 1 |
| 8 | `src/components/staff/KitchenDisplaySystem.tsx` | 1, 2, 3 |
| 9 | `src/components/staff/OperationsContent.tsx` | 1 |
| 10 | `src/components/checkout/StaffCheckoutModal.tsx` | 1 |
| 11 | `src/components/staff/StaffCheckoutModal.tsx` | 1, 3 |
| 12 | `src/components/staff/StaffPaymentModal.tsx` | 1, 3 |
| 13 | `src/components/staff/QuickPayModal.tsx` | 1 |
| 14 | `src/components/staff/PickupOrderCard.tsx` | 1, 3 |
| 15 | `src/components/staff/PaymentStatusBadge.tsx` | 1 |
| 16 | `src/types/database.ts` | 2 |
| 17 | `src/hooks/useKitchenOrders.ts` | 2 |
| 18 | `src/hooks/useStaffCheckout.ts` | 2 |
| 19 | `src/hooks/useCheckout.ts` | 2 |

### Database Migration

One migration adding `order_channel` column + index to `orders` table.

### No Breaking Changes

- Customer-facing UI is completely untouched (no `.staff-pos` class applied)
- Existing orders default to `'in_store'` via column default
- All filter changes are additive (default view shows all orders)
- No existing columns are modified or removed
