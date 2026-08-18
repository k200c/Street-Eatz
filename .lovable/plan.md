# Plan: Filter Unpaid Web Orders from KDS

## Current State (verified)
- `useKitchenOrders.ts` fetches every non-`completed` order and never looks at `payment_status`.
- `KitchenDisplaySystem.tsx` renders the `cooking` and `ready` columns and tests `payment_status !== 'paid'` in three places (`OrderCard.isUnpaid`, `filterOrders`, `unpaidCount`).
- `PaymentStatusBadge.tsx` already treats both `paid` and `completed` as paid, which is why the badge text looks right while `isUnpaid` is wrong.

### What the live data actually says
`SELECT order_channel, payment_method, payment_status, user_id IS NULL, count(*) FROM orders GROUP BY 1,2,3,4`:

- `payment_status` in production is **six** values, not two: `paid`, `completed`, `pending`, `unpaid`, `processing`, `failed`. Both `paid` (292 rows) and `completed` (447 rows) are real and current — `paid` has not gone away.
- `order_channel` is **never null**: every non-voice order is `web`, including staff POS orders. It cannot distinguish counter orders from web checkouts.
- The abandoned-checkout rows this fix targets are `web / card / pending` (187 rows, latest 15 Aug).
- **Staff POS card orders are inserted as `web / card / pending` too** (`useStaffCheckout.ts` inserts `payment_status: 'pending'` for card, no `order_channel`, no `user_id`). They are indistinguishable from abandoned web checkouts on these columns. `user_id IS NULL` doesn't separate them either — guest web orders are also null.

## Goal
Stop unpaid web/card checkouts reaching the kitchen, fix the double-charge risk on paid orders, and do not make a counter order invisible.

## Proposed Change
`src/components/staff/KitchenDisplaySystem.tsx` only.

### 1. One shared payment helper (Amendment 2)
Add a single local helper at module scope and use it for every payment decision in the file:

```text
const PAID_STATUSES = ['paid', 'completed'];
const isOrderPaid = (order) => PAID_STATUSES.includes(order.payment_status ?? '');
```

Replace all three `payment_status !== 'paid'` comparisons with `!isOrderPaid(order)`:
- `OrderCard`'s `isUnpaid` — this is what stops a paid order staying clickable and re-opening `StaffCheckoutModal` (double-charge risk).
- `filterOrders` (the "Show Unpaid Only" toggle).
- `unpaidCount` (the header badge).

The helper is an allowlist of paid values, so `unpaid`, `processing` and `failed` all correctly read as not-paid.

### 2. Kitchen eligibility filter
An order is eligible for the kitchen columns if:
- `isOrderPaid(order)` — covers both `paid` and `completed`, OR
- `payment_method !== 'card'` — cash / pay-on-collection, OR
- `order_channel === 'voice'`.

Apply it to `cooking` and `ready` before the `showUnpaidOnly` toggle. Leave the pickup / `pending_payment` tab untouched.

### 3. Nothing is permanently hidden (Amendment 3)
Because a staff POS card order is briefly `card / pending` between insert and terminal confirmation, the filter above would hide it. Terminal confirmation writes `paid` within seconds and it appears — but if that handshake fails the ticket would vanish from the pass.

To make that non-destructive, add a small **"Show hidden unpaid"** toggle beside the existing filter, defaulting off. When on, the eligibility filter is bypassed and hidden orders render with a clear amber "UNPAID — NOT CONFIRMED" marker. Staff always have a way to see a ticket the filter suppressed, and the default view stays clean.

### 4. Counts
Derive `totalOrders` and `unpaidCount` from the filtered lists so the header badges match what is on screen.

## Files Touched
- `src/components/staff/KitchenDisplaySystem.tsx` only. No hook, edge function, payment logic, DB or RLS change.

## Verification (Amendment 1)
- A paid web order with **`payment_status = 'completed'`** appears, and its badge is **not clickable** (no re-charge).
- A web order with `payment_status = 'paid'` also appears and is not clickable — both values are live.
- A cash / pay-on-collection order appears.
- A voice order appears.
- A `web / card / pending` order is hidden by default, and becomes visible with "Show hidden unpaid" on.
- `processing` and `failed` card orders are hidden by default (not paid).
- "Show Unpaid Only" still filters the eligible list.
- Build passes with no TypeScript errors.

## Known Limitation / Recommended Follow-up
Staff POS card orders cannot be distinguished from abandoned web checkouts in the current schema, so this fix relies on the reveal toggle rather than a precise rule. The clean fix is to stamp a source marker on POS inserts (for example `order_channel = 'pos'`) and key the filter on that. That touches `useStaffCheckout.ts` and the DB, so it is out of scope here and proposed as a separate change.

## Rollback
Revert the single change to `src/components/staff/KitchenDisplaySystem.tsx`.