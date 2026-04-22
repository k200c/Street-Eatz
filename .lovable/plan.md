# Card Payment Provider Toggle (Viva ↔ MyPOS)

Surgical, additive enhancement. No refactor. No regression to existing Viva, terminal, or cash flows.

## Scope

Add a Command Center toggle that picks the active card provider (`viva` | `mypos`) and inject `payment_provider` into every payment payload sent to the `street-eatz-payment` n8n webhook. Default = `viva`.

## 1. Database (smallest possible)

Add **one column** to the existing `app_settings` singleton (id=1):

```sql
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS card_payment_provider text NOT NULL DEFAULT 'viva';

ALTER TABLE public.app_settings
  ADD CONSTRAINT card_payment_provider_check
  CHECK (card_payment_provider IN ('viva','mypos'));
```

Reuses existing realtime subscription, RLS (staff/admin update, public read), and the `useAppSettings` hook. No new table, no new RLS, no new policy.

## 2. Type & Hook updates

`**src/hooks/useAppSettings.ts**`

- Extend `AppSettings` interface with `card_payment_provider: 'viva' | 'mypos'`.
- Extend `useUpdateAppSettings` mutation `Partial<Pick<...>>` to include the new field.

No other hook changes needed — realtime invalidation already covers it.

## 3. Command Center UI

`**src/pages/CommandCenter.tsx**` — add a new card directly **under the Wait Time card** in the Operations tab. Style mirrors the existing wait-time card (dark, minimal, motion-fade with `delay: 0.15`).

Layout:

```
┌─────────────────────────────────────────────┐
│ 💳 Card Payment Provider                    │
│ Active provider for card transactions        │
│                                              │
│         [ VIVA ] [ MyPOS ]   ← segmented    │
└─────────────────────────────────────────────┘
```

Use existing `Tabs` or a `ToggleGroup` (already in components/ui) for a 2-option segmented control. On change → `updateSettings.mutateAsync({ card_payment_provider: value })` + toast. Reads current value from `settings?.card_payment_provider ?? 'viva'`.

## 4. Payload propagation (3 call sites)

A tiny shared helper to centralize the read + fallback:

**New file `src/lib/paymentProvider.ts**`

```ts
import { supabase } from '@/integrations/supabase/client';
export type PaymentProvider = 'viva' | 'mypos';

export async function getActivePaymentProvider(): Promise<PaymentProvider> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('card_payment_provider')
      .eq('id', 1)
      .maybeSingle();
    const v = data?.card_payment_provider;
    return v === 'mypos' ? 'mypos' : 'viva'; // safe default
  } catch {
    return 'viva';
  }
}
```

Inject `payment_provider` into the three payload builders (additive — all existing fields untouched):


| File                                                | Function                                                                    | Payload                                |
| --------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| `src/components/checkout/CustomerCheckoutModal.tsx` | `handlePayCard` (~line 229)                                                 | online card → add `payment_provider`   |
| `src/components/checkout/StaffCheckoutModal.tsx`    | `handleCardPayment` (~line 86)                                              | terminal card → add `payment_provider` |
| `supabase/functions/viva-wallet/index.ts`           | `webhookPayload` (line 153) and legacy `create-checkout` payload (line 307) | latent path → also include for safety  |


For the Edge Function, accept an optional `payment_provider` on the request body (forwarded by any future caller) and fall back to a server-side fetch of `app_settings.card_payment_provider`, then default to `'viva'`.

**Cash flow: no change.** No provider field needed — verified `sendToKitchen` payload (`useCheckout.ts` line 207) sends `paymenttype: 'collection'` and is not card-routed.

## 5. Default Safety

- DB default `'viva'`
- Helper returns `'viva'` on any error or non-`'mypos'` value
- If `app_settings` row missing → `'viva'`
- If realtime subscription not yet hydrated when payload built → fetched fresh from DB at submit time (not cached) so the latest toggle is always honoured

## 6. Files Touched


| File                                                | Change                           |
| --------------------------------------------------- | -------------------------------- |
| `supabase/migrations/<new>.sql`                     | Add column + check constraint    |
| `src/hooks/useAppSettings.ts`                       | Extend interface + mutation type |
| `src/pages/CommandCenter.tsx`                       | New card under Wait Time         |
| `src/lib/paymentProvider.ts`                        | **New** helper                   |
| `src/components/checkout/CustomerCheckoutModal.tsx` | +1 line in payload               |
| `src/components/checkout/StaffCheckoutModal.tsx`    | +1 line in payload               |
| `supabase/functions/viva-wallet/index.ts`           | +1 field in 2 payloads           |


Zero changes to: cart, order insert, order_items, KDS, payment confirmation, viva-wallet OAuth flow, Wait Time, Store Open toggle, Dev Mode, special_notes, totals, customer fields, RLS.

## 7. Test Plan

1. **Toggle persistence** — switch to MyPOS → refresh Command Center → still MyPOS. Switch back to Viva → still Viva.
2. **Realtime** — open Command Center in two tabs → toggle in tab A → tab B updates within ~1s.
3. **Online card + Viva** — customer checkout → inspect network → payload contains `"payment_provider":"viva"`. n8n routes to Viva branch (existing behaviour, unchanged).
4. **Online card + MyPOS** — toggle to MyPOS → customer checkout → payload contains `"payment_provider":"mypos"`. n8n provider switch routes to MyPOS branch.
5. **Terminal card + Viva** — KDS → Charge Card → payload contains `"payment_provider":"viva"`.
6. **Terminal card + MyPOS** — toggle → KDS → Charge Card → payload contains `"payment_provider":"mypos"`.
7. **Cash unchanged** — cash collection flow → no `payment_provider` field, kitchen webhook fires as before.
8. **Fallback** — manually `UPDATE app_settings SET card_payment_provider = NULL WHERE id=1` (will fail check) — confirm column never goes null. Set to `'viva'` to verify default path.
9. **Mobile/desktop** — Command Center renders cleanly at 375px and 1440px widths.
10. **Existing regression sweep** — Wait Time still updates, Store Open toggle still works, Dev Mode still works.

## 8. Rollback

Three-step revert if needed:

1. Revert the three payload code edits (one line each) → frontend stops sending `payment_provider` → n8n provider switch falls through to default Viva branch.
2. Hide the Command Center card (comment out the JSX block).
3. Optionally drop the column: `ALTER TABLE app_settings DROP COLUMN card_payment_provider;`

n8n live Viva flow continues working at every step because it's the default branch.  
  
Implement this exactly as a surgical, additive change in the live Street Eatz app.

OBJECTIVE

Add a Command Center control to select the active card payment provider `viva` or `mypos`) and inject `payment_provider` into all relevant card payment payloads sent to the `street-eatz-payment` n8n webhook.

NON-NEGOTIABLES

- No refactor

- No regression

- Default must remain Viva

- Existing Viva online flow must continue working

- Existing Viva terminal flow must continue working

- Cash flow must remain untouched

- Do not change totals, items, notes, checkout logic, order insert logic, KDS, or payment confirmation logic beyond additive provider propagation

DATABASE

Use the existing `public.app_settings` singleton row `id = 1`).

Add one column only:

```sql

ALTER TABLE [public.app](http://public.app)_settings

  ADD COLUMN IF NOT EXISTS card_payment_provider text NOT NULL DEFAULT 'viva';

DO $$

BEGIN

  IF NOT EXISTS (

    SELECT 1

    FROM pg_constraint

    WHERE conname = 'card_payment_provider_check'

  ) THEN

    ALTER TABLE [public.app](http://public.app)_settings

      ADD CONSTRAINT card_payment_provider_check

      CHECK (card_payment_provider IN ('viva','mypos'));

  END IF;

END $$;