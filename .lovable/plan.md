
# Production Changes Plan: StreetEatz Web App

## Summary

This plan addresses four key requirements:
1. Remove Quick Access (OTP) login - enforce email/password only
2. Add Edit Cart Item functionality for both Staff POS and Customer carts
3. Update Handcut Chips price to €3.50 in "Make It Epic" section
4. Quality and safety checks for cart, payments, and receipts

---

## 1. Remove Quick Access Login (Critical)

### Current State
The Auth.tsx page has a tabbed interface with two tabs:
- "Sign In" (email/password) - Lines 375-520
- "Quick Access" (OTP via email/phone) - Lines 522-576

There's also an OTP verification step (Lines 581-663) and profile completion step (Lines 666-734) that are only used by the Quick Access flow.

### Changes Required

**File: `src/pages/Auth.tsx`**

| Change | Description |
|--------|-------------|
| Remove Tabs component | Replace tabbed UI with just the email/password form |
| Remove Quick Access state | Delete `identifier`, `otpType`, `otp` state variables |
| Remove OTP handlers | Delete `handleSendOtp`, `handleVerifyOtp`, `handleResendOtp` functions |
| Remove OTP step | Delete the `step === 'otp'` conditional render block |
| Simplify step type | Change from `'credentials' | 'otp' | 'profile' | 'success'` to `'credentials' | 'profile' | 'success'` |
| Clean up imports | Remove `InputOTP`, `InputOTPGroup`, `InputOTPSlot`, `Zap` imports |

The profile completion step remains for users who signed up without completing their profile (edge case from signup flow).

### Code Flow After Change

```text
User visits /auth
    ↓
Shows email/password form (Sign In or Sign Up toggle)
    ↓
On successful sign in → Redirect based on role
On successful sign up → "Check your email to confirm" message
```

---

## 2. Edit Cart Item Feature (High Priority)

### Current State
Both cart stores (`cartStore.ts` and `staffCartStore.ts`) support:
- `addItem` - Add new item
- `removeItem` - Remove by index
- `updateQuantity` - Change quantity only
- `clearCart` - Clear all items

**Missing:** No way to edit modifiers, extras, or removed ingredients on an existing cart item.

### Solution Architecture

Add an `updateItem` function to both stores that replaces an item at a given index with new customizations.

**Flow:**

```text
User clicks "Edit" on cart item
    ↓
Opens ProductSheet/StaffProductSheet with existing item data pre-populated
    ↓
User modifies options (extras, removals, quantity)
    ↓
On "Update Order" → replaces item at index with new configuration
    ↓
Price recalculates automatically
```

### Changes Required

**File: `src/stores/cartStore.ts`**

Add new `updateItem` function:
```typescript
updateItem: async (index: number, product: Product, quantity: number, modifiers: SelectedModifier[], removedIngredients: RemovedIngredient[]) => Promise<void>;
```

This function will:
1. Calculate new total price
2. For authenticated users: Update the `cart_items` record in Supabase
3. For guest users: Update localStorage
4. Update local state

**File: `src/stores/staffCartStore.ts`**

Add synchronous `updateItem` function (staff cart is localStorage-only):
```typescript
updateItem: (index: number, product: Product, quantity: number, modifiers: SelectedModifier[], removedIngredients: RemovedIngredient[]) => void;
```

**File: `src/components/customer/ProductSheet.tsx`**

Add edit mode support:
- New optional props: `editMode?: boolean`, `editIndex?: number`, `initialItem?: CartItem`
- When in edit mode, pre-populate all fields from `initialItem`
- Change button text from "ADD TO ORDER" to "UPDATE ORDER"
- On submit, call `updateItem(editIndex, ...)` instead of `addItem(...)`

**File: `src/pages/Cart.tsx`**

Add Edit button to each cart item:
- New state: `editingItem: { index: number, item: CartItem } | null`
- Render ProductSheet when `editingItem` is set
- Pass edit mode props to ProductSheet

**File: `src/components/staff/StaffProductSheet.tsx`**

Same changes as ProductSheet - add edit mode support.

**File: `src/components/staff/StaffPOSContent.tsx`**

Add Edit button next to each cart item:
- New state for editing
- Open StaffProductSheet in edit mode when clicked

### Cart Item UI Enhancement

Each cart item will show:
```text
┌─────────────────────────────────────────┐
│ [Image] Smash Burger         €12.50    │
│         + Extra Cheese (+€1.00)        │
│         - No Onions                     │
│         Qty: 2                          │
│ [Edit]  [−] 2 [+]              [🗑️]    │
└─────────────────────────────────────────┘
```

---

## 3. Menu Price Update: Handcut Chips to €3.50

### Current State

The price €3.00 appears in two places:

1. **Database `modifiers` table:**
   - Record ID: `63eeede4-8f64-46a2-97e1-94b90e0fe4d7`
   - Name: "Handcut Chips"
   - Price: €3.00

2. **Frontend constant arrays:**
   - `src/components/customer/ProductSheet.tsx` line 59
   - `src/components/staff/StaffProductSheet.tsx` line 48

Both have:
```typescript
const STANDALONE_ADDONS = [
  // ...
  { id: 'handcut-chips', name: 'Handcut Chips', price: 3.00 },
];
```

### Changes Required

**Database Migration:**
```sql
UPDATE modifiers 
SET price_adjustment = 3.50 
WHERE id = '63eeede4-8f64-46a2-97e1-94b90e0fe4d7';
```

**File: `src/components/customer/ProductSheet.tsx`**
```typescript
// Line 59: Change price from 3.00 to 3.50
{ id: 'handcut-chips', name: 'Handcut Chips', price: 3.50 },
```

**File: `src/components/staff/StaffProductSheet.tsx`**
```typescript
// Line 48: Change price from 3.00 to 3.50
{ id: 'handcut-chips', name: 'Handcut Chips', price: 3.50 },
```

### Price Flow Verification

The €3.50 price will flow through:
1. **Cart display:** Uses `item.selectedModifiers` which stores the `price_adjustment`
2. **Order totals:** Calculated from `selectedModifiers.reduce((sum, m) => sum + m.price_adjustment, 0)`
3. **Database orders:** The `selected_modifiers` JSONB column stores the full modifier objects including prices
4. **Kitchen Display:** Reads from `order_items.selected_modifiers`
5. **Receipts:** Built from the same order data

---

## 4. Quality & Safety Checks

### Already Implemented ✓

After reviewing the codebase:

| Check | Status | Location |
|-------|--------|----------|
| Cart shows base item | ✓ | Cart.tsx lines 156-183 |
| Cart shows modifiers | ✓ | Green/red badges for +/- items |
| Cart shows item total | ✓ | `item.totalPrice.toFixed(2)` |
| Payment matches cart | ✓ | Checkout modals use `getTotal()` |
| No SMS/Twilio for orders | ✓ | Orders use database + Viva Wallet |

### Additional Safeguards to Add

**Staff POS Checkout Protection:**

Add a confirmation step or delay before the checkout button becomes active to prevent accidental taps during busy service.

**File: `src/components/staff/StaffPOSContent.tsx`**

The checkout button currently has no safeguard. Add a 300ms touch delay:

```typescript
// Add state
const [checkoutReady, setCheckoutReady] = useState(true);

// Reset when items change
useEffect(() => {
  if (items.length > 0) {
    setCheckoutReady(false);
    const timer = setTimeout(() => setCheckoutReady(true), 300);
    return () => clearTimeout(timer);
  }
}, [items.length]);
```

This prevents accidental double-taps when adding the last item before checkout.

---

## File Modification Summary

| File | Changes |
|------|---------|
| `src/pages/Auth.tsx` | Remove Quick Access tab and OTP flow |
| `src/stores/cartStore.ts` | Add `updateItem` function |
| `src/stores/staffCartStore.ts` | Add `updateItem` function |
| `src/components/customer/ProductSheet.tsx` | Add edit mode, update Handcut Chips to €3.50 |
| `src/pages/Cart.tsx` | Add Edit button and editing state |
| `src/components/staff/StaffProductSheet.tsx` | Add edit mode, update Handcut Chips to €3.50 |
| `src/components/staff/StaffPOSContent.tsx` | Add Edit button and checkout safeguard |

**Database Migration:**
- Update `modifiers` table: Handcut Chips price to €3.50

---

## Implementation Order

1. **Auth changes** - Remove Quick Access (least dependencies)
2. **Price update** - Database + constants (simple, isolated change)
3. **Cart stores** - Add `updateItem` functions
4. **Cart UI** - Add Edit buttons and edit mode
5. **Safety checks** - Add checkout delay

---

## Testing Checklist

After implementation, verify:

- [ ] Quick Access tab is gone from /auth
- [ ] Email/password login works for customers
- [ ] Email/password login works for staff (redirects to /admin/pos)
- [ ] Sessions persist after login
- [ ] Sign up flow still works (with email confirmation)
- [ ] Customer cart: Edit button appears on each item
- [ ] Customer cart: Editing updates modifiers and recalculates price
- [ ] Staff POS cart: Edit button appears on each item
- [ ] Staff POS cart: Editing updates modifiers and recalculates price
- [ ] Edited items display correctly in order summary
- [ ] Edited items appear correctly on KDS
- [ ] Handcut Chips shows €3.50 in Make It Epic section
- [ ] Adding Handcut Chips to cart adds €3.50 to total
- [ ] Staff checkout has brief delay before becoming active
- [ ] Payment total always matches cart total
