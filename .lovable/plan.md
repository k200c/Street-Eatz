## Goal
Show `customer_phone` directly beneath `customer_name` on each KDS order card so kitchen staff can quickly contact customers.

## Investigation summary
- Order card renders in `src/components/staff/KitchenDisplaySystem.tsx` (around line 265, the `{order.customer_name && ...}` block).
- Orders are fetched in `src/hooks/useKitchenOrders.ts` via `supabase.from('orders').select('*')` — `customer_phone` is **already** present on every order object (confirmed: `orders.customer_phone` exists in schema and is used elsewhere in the same file at line 479).
- Realtime subscription already refetches on INSERT/UPDATE, so new orders will include the phone automatically.
- No DB migration, no query change, no type change required.

## Change (single file)
**`src/components/staff/KitchenDisplaySystem.tsx`** — extend the existing customer name block only:

```tsx
{/* Customer Name + Phone */}
{order.customer_name && (
  <div className="mb-2 mt-2">
    <p className="text-sm font-medium text-primary leading-tight">
      {order.customer_name}
    </p>
    {order.customer_phone && (
      <a
        href={`tel:${order.customer_phone}`}
        className="text-xs text-muted-foreground tabular-nums tracking-wide hover:underline"
      >
        {order.customer_phone}
      </a>
    )}
  </div>
)}
```

Notes:
- Wrapped in existing `customer_name` conditional → if no name, nothing changes (preserves current behavior).
- Phone has its own truthy check → null/undefined/empty string render nothing (no "N/A").
- `tel:` link is a small bonus for tablet use; harmless on desktop. Can drop to a plain `<p>` if undesired.
- Uses existing semantic tokens (`text-muted-foreground`, `text-primary`) — no design-system drift.
- Mobile/iPad safe: `text-xs` with leading-tight, no fixed widths, no overflow risk.

## Explicitly NOT touched
- `useKitchenOrders.ts` query, types, realtime subscription, polling.
- Order lifecycle, payment, n8n webhooks, printing, KDS workflow logic.
- Database schema (no migration).
- `PickupOrderCard` / customer-facing components.

## Verification checklist
1. Existing order with name + phone → both render, phone smaller/muted under name.
2. Order with name but no phone → only name renders (no placeholder).
3. Historical order with neither → block hidden as today.
4. New realtime order → appears with phone immediately (existing refetch path).
5. iPad viewport → no overflow, readable hierarchy.
6. Dark mode → muted-foreground token already theme-aware.
