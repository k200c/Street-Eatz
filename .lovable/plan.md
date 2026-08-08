# Plan: Filter Unpaid Web Orders from KDS

## Current State
- `useKitchenOrders.ts` fetches every non-`completed` order and groups them into `cooking`/`ready`/`pending_payment` buckets.
- `KitchenDisplaySystem.tsx` renders the `cooking` and `ready` columns and applies an optional "Show Unpaid Only" toggle on top of those buckets.
- `PaymentStatusBadge.tsx` treats both `paid` and `completed` as paid; the KDS card currently uses `payment_status !== 'paid'` to flag unpaid orders.

## Goal
Hide web/card orders that have not been paid from the kitchen board. Orders should still appear if they are genuinely paid, cash/pay-on-collection, or voice/in-person.

## Proposed Change
Modify `src/components/staff/KitchenDisplaySystem.tsx` only.

1. Add a base eligibility filter that runs before the existing `showUnpaidOnly` toggle.
   An order is eligible for the KDS kitchen tab if:
   - `payment_status` is `'paid'` or `'completed'`, OR
   - `payment_method` is `'cash'` (covers pay-on-collection and in-person cash), OR
   - `order_channel` is `'voice'`.

2. Apply this eligibility filter to both the `cooking` and `ready` arrays so unpaid web/card orders never render in the kitchen columns.

3. Keep the existing `showUnpaidOnly` toggle working on the already-eligible subset (staff can still choose to see only the unpaid cash/voice orders if they want).

4. Update the derived counts (`totalOrders`, `unpaidCount`) so the header badges reflect the filtered list.

5. Leave `pending_payment` / pickup tab untouched — those are intentionally for orders awaiting payment.

## Files Touched
- `src/components/staff/KitchenDisplaySystem.tsx` only.

## Verification
- Build the project to ensure no TypeScript errors.
- Open the KDS preview and confirm that:
  - A paid web order (`payment_status = 'paid'`) appears.
  - A cash order appears.
  - A voice order appears.
  - A web/card order with `payment_status = 'pending'` is hidden.
  - The "Show Unpaid Only" toggle still filters the remaining eligible orders.

## Rollback
Revert the single change in `src/components/staff/KitchenDisplaySystem.tsx`.
