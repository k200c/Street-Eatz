# Plan: Remove duplicate KDS status notifications (double SMS)

## Problem
On "Mark Ready", the customer receives **two** SMS:
1. `useKitchenOrders.ts` `updateOrderStatus` mutation POSTs directly to the
   hardcoded `N8N_STATUS_URL` (public, unauthenticated n8n webhook).
2. `KitchenDisplaySystem.tsx` `handleStatusChange` invokes the authenticated
   `update-order-status` edge function.

Both send a `status_update` payload to the same n8n Order Ingestion workflow,
so n8n fires the SMS twice.

## Scope — exactly two files, no other changes

### File 1 — `src/hooks/useKitchenOrders.ts`
- **Delete** the `N8N_STATUS_URL` constant (lines 7-8, including the comment).
- **Delete** the entire webhook block inside `updateOrderStatus`
  (lines 131-167): the `if (['cooking', 'ready'].includes(status))` branch,
  the `fetch(N8N_STATUS_URL, …)` call, the toast warnings, and the try/catch.
- The mutation becomes: build `updatePayload` → `supabase.from('orders').update(...)` → `.select(...)` → return `data`. No network call to n8n.
- Keep `onSuccess` (invalidate `kitchen-orders`) and `onError` (toast) unchanged.
- `toast` import is still used by `onError`, so leave the import.

### File 2 — `src/components/staff/KitchenDisplaySystem.tsx`
- In `handleStatusChange`, change the guard (line 525) from
  `if (!skipWebhook && newStatus === 'ready')` to
  `if (!skipWebhook && (newStatus === 'cooking' || newStatus === 'ready'))`.
- This restores the `'cooking'` notification that the hook used to send (now via
  the authenticated edge function instead of the public webhook), and keeps the
  `'ready'` notification as the single source of SMS.
- No other logic in `handleStatusChange` changes (fetch-then-send pattern,
  edge function invocation, DB mutation call, toast labels all stay).

## Why this is safe
- The edge function `update-order-status` already authenticates the staff user
  via `has_role()` and forwards to the same n8n webhook using the
  `N8N_STATUS_WEBHOOK_URL` secret — it is the correct single channel.
- `OrderCard.handleAction` sets `skipWebhook = currentStatus !== 'cooking'`,
  so the only card-driven notifications are cooking→ready (`skipWebhook=false`,
  fires for `'ready'`) and ready→completed / quick-complete (`skipWebhook=true`,
  no notification). Drag-to-`'cooking'` will now correctly notify via the edge
  function, matching the hook's former behavior.
- Completed orders never notify (skipWebhook=true from cards; the new
  condition excludes `'completed'`).

## Verification
- After edits, check `/tmp/observability/build-errors.log` — expect "build OK".
- Confirm no remaining references to `N8N_STATUS_URL` in `src/`:
  `rg N8N_STATUS_URL src/` returns nothing.
- Confirm `updateOrderStatus` no longer imports/uses the removed webhook.
