
# Voice Order System: Edge Function + Kitchen VOICE Badge

## Overview

Create a new `create-voice-order` Edge Function that accepts spoken item names from a voice agent, resolves them to real products via fuzzy matching, computes totals server-side, and inserts into the existing `orders` + `order_items` tables. Add an `order_channel` column to mark voice orders, and display a "VOICE" badge in the Kitchen Display.

---

## Database Migration

Add a nullable `order_channel` text column to the `orders` table with default `'web'`:

```sql
ALTER TABLE public.orders ADD COLUMN order_channel text DEFAULT 'web';
```

This is backward-compatible: all existing orders get `'web'`, voice orders will be inserted with `'voice'`. No RLS changes needed (existing policies already cover inserts via service role).

---

## File Changes

### 1. NEW: `supabase/functions/create-voice-order/index.ts`

Edge Function that:

**Input payload:**
```json
{
  "customer_name": "John",
  "customer_phone": "0851234567",
  "payment_method": "cash",
  "items": ["Applewood double smashed cheeseburger", "fries", "Coke"],
  "special_notes": "No onions on the burger",
  "call_id": "call_abc123",
  "transcript": "I'd like a burger, fries and a coke please"
}
```

Items can also be `[{ "spoken_name": "fries", "qty": 2 }]` format.

**Processing steps:**
1. CORS + OPTIONS handling
2. Validate required fields (customer_name, customer_phone, payment_method, items)
3. Normalize phone to +353 format
4. Normalize payment_method (debit/credit/contactless/tap to card; notes/coins to cash)
5. For each item:
   - Trim, collapse spaces, lowercase
   - Apply alias map: fries/chips to "handcut chips", coke/coca cola to "coke", coke zero to "coke zero", fanta to "fanta orange", water to "water"
   - Exact case-insensitive match on products.name
   - Fallback: ILIKE contains match
   - If 0 matches: 404 error
   - If multiple matches: 409 with top 3 candidates
   - Reject if is_available=false OR is_sold_out=true
6. Compute total = sum(price * qty), rounded to 2 decimals
7. Insert into `orders` with `order_channel = 'voice'`, `special_notes` includes call_id/transcript
8. Insert into `order_items`
9. Return `{ success, order_id, display_id, total, source: "voice" }`

**Error responses:**
- 400: missing/invalid fields
- 404: item not found
- 409: ambiguous match (returns candidates) or product unavailable
- 500: unexpected errors

**Security:** No JWT required (voice agent is external). Uses service role key server-side only.

### 2. UPDATE: `supabase/config.toml`

Add:
```toml
[functions.create-voice-order]
verify_jwt = false
```

### 3. UPDATE: `src/components/staff/KitchenDisplaySystem.tsx`

Add a VOICE badge in the OrderCard header (next to the order number) when `order.order_channel === 'voice'`:

```
<span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white font-bold uppercase">
  VOICE
</span>
```

The badge appears between the order number and the payment status badge. Purple color distinguishes it from payment badges.

Since the `order_channel` column is new and the Supabase types file auto-generates, and KitchenOrder extends `Tables<'orders'>`, the field will be available after migration. We cast via `(order as any).order_channel` to avoid waiting for type regeneration.

---

## Alias Map (hardcoded in edge function)

| Voice term | Resolves to |
|-----------|-------------|
| fries, chips | Handcut Chips |
| coke, coca cola, coca-cola | Coke |
| coke zero, diet coke | Coke Zero |
| fanta, fanta orange | Fanta Orange |
| water, still water | Water |
| capri sun, caprisun | Capri Sun |

---

## Example curl

**Success:**
```bash
curl -X POST https://ftzinsesuiuqcjfpbaur.supabase.co/functions/v1/create-voice-order \
  -H "Content-Type: application/json" \
  -H "apikey: <anon_key>" \
  -d '{
    "customer_name": "John",
    "customer_phone": "0851234567",
    "payment_method": "cash",
    "items": ["applewood double smash cheeseburger", "fries", "coke"]
  }'
```

Response:
```json
{
  "success": true,
  "order_id": "uuid",
  "display_id": 92,
  "total": 21.30,
  "source": "voice"
}
```

**Ambiguous (409):**
```json
{
  "error": "Ambiguous match for 'burger'",
  "spoken_name": "burger",
  "candidates": [
    { "id": "...", "name": "The Urban Legend", "price": 10.50 },
    { "id": "...", "name": "Island Spice Burger", "price": 10.50 },
    { "id": "...", "name": "The Mother Clucker", "price": 10.50 }
  ]
}
```

---

## Complete File Summary

| # | File | Action |
|---|------|--------|
| 1 | `orders` table | Migration: add `order_channel` text column |
| 2 | `supabase/functions/create-voice-order/index.ts` | Create new |
| 3 | `supabase/config.toml` | Add function entry |
| 4 | `src/components/staff/KitchenDisplaySystem.tsx` | Add VOICE badge in OrderCard |

No other files need changes. The KDS hook (`useKitchenOrders`) already fetches all order columns via `select('*')`, so `order_channel` flows through automatically.
