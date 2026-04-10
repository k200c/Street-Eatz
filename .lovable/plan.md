

# Fix: `completed_at` Not Set When KDS Marks Order Completed

## Root Cause

In `src/hooks/useKitchenOrders.ts` line 112, the `updateOrderStatus` mutation updates the order with only `{ status }`:

```ts
const { data, error } = await supabase
  .from('orders')
  .update({ status })  // ← only status, no completed_at
  .eq('id', orderId)
```

There IS a database trigger (`trg_set_completed_at`) that should auto-set `completed_at` on transition to `'completed'`. However, based on the user's report that `completed_at` is not being set reliably, the trigger may not be firing. This could be because:
- The trigger was added recently and existing completed orders predate it
- Or the trigger is a `BEFORE UPDATE` trigger that requires `OLD.status IS DISTINCT FROM 'completed'` — which works correctly for new transitions but the frontend update doesn't include `completed_at` as a fallback

**The safest fix**: include `completed_at` explicitly in the frontend update when status is `'completed'`. This is belt-and-suspenders — works regardless of trigger state, and the trigger's `AND NEW.completed_at IS NULL` guard prevents double-setting.

## Fix

**File**: `src/hooks/useKitchenOrders.ts`

**Change**: Line 112 — when `status === 'completed'`, include `completed_at` in the update payload.

```ts
// Line 110-115, change from:
const { data, error } = await supabase
  .from('orders')
  .update({ status })
  .eq('id', orderId)
  .select('id, status, customer_name, customer_phone')
  .maybeSingle();

// To:
const updatePayload: Record<string, unknown> = { status };
if (status === 'completed') {
  updatePayload.completed_at = new Date().toISOString();
}
const { data, error } = await supabase
  .from('orders')
  .update(updatePayload)
  .eq('id', orderId)
  .select('id, status, customer_name, customer_phone')
  .maybeSingle();
```

## Why This Is Safe

- Only affects the `completed` transition — `cooking` and `ready` updates are unchanged
- The DB trigger has a guard (`AND NEW.completed_at IS NULL`) so it won't conflict — if frontend sets it, trigger skips; if frontend somehow doesn't, trigger catches it
- No schema changes, no new files, no UI changes
- Payment logic, KDS grouping, webhook logic — all untouched
- The Quick Complete path also goes through `updateOrderStatus`, so it's covered too

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useKitchenOrders.ts` | Include `completed_at` in update payload when status is `'completed'` |

## Test Checklist

1. Mark a cooking order → ready (verify no `completed_at` set)
2. Mark a ready order → completed (verify `completed_at` is populated)
3. Use Quick Complete on a cooking order (verify `completed_at` is populated)
4. Check the DB: `SELECT id, status, completed_at FROM orders WHERE status = 'completed' ORDER BY created_at DESC LIMIT 5`
5. Wait 60+ minutes (or temporarily lower the threshold) and verify `get-pending-review-orders` returns the order

