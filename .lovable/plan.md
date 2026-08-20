# Plan: Add shared-secret auth to the viva-wallet `webhook` action

## Problem
`supabase/functions/viva-wallet/index.ts`, `case 'webhook'` accepts an `orderCode`
+ `statusId` and — when `statusId === 'F'` — sets `payment_status = 'completed'` on
the matching order using the service role key. It has **no authentication**.

The `orderCode` is returned to the customer's browser during checkout (the
`type: 'online'` path returns it in the JSON body). A customer can therefore POST
`{ action: "webhook", orderCode, statusId: "F" }` to this function and mark their
own order paid without paying.

## Evidence (verified this turn)
- `case 'webhook'` (lines 411–467) does no auth check before the DB update.
- `N8N_WEBHOOK_SECRET` exists in project secrets (used by `confirm-payment`).
- The exact guard pattern already lives in `supabase/functions/confirm-payment/index.ts`
  (lines 34–52): read `N8N_WEBHOOK_SECRET`, 500 if unset, 401 if `Authorization`
  header ≠ `Bearer <secret>`.
- **Caller audit:** no frontend code, no other edge function, and no n8n workflow
  references the `viva-wallet` URL. n8n's Payment Processor calls `confirm-payment`
  (8×), `get-order` (6×), and `check-payment-ingestion-lock` (3×). Viva Wallet's
  webhook is received by n8n's "Viva Webhook Receive" trigger, which then calls
  `confirm-payment`. So the `webhook` action is legacy/unused — but still publicly
  reachable, so it remains a live hole. Adding the secret will not break the live
  payment flow (which runs through `confirm-payment`), and n8n already holds the
  secret if this path is ever re-wired to it.

## Change — single file: `supabase/functions/viva-wallet/index.ts`

At the very start of `case 'webhook':`, before the existing
`const { orderCode, transactionId, statusId } = data;` line, insert:

```ts
const expectedSecret = Deno.env.get("N8N_WEBHOOK_SECRET");
if (!expectedSecret) {
  console.error("N8N_WEBHOOK_SECRET not configured");
  return new Response(JSON.stringify({ error: "Server misconfiguration" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const authHeader = req.headers.get("Authorization");
if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
  console.warn("Unauthorized viva-wallet webhook attempt");
  return new Response(JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

### Untouched (per the request)
- `type: 'online'` handling (the live checkout path).
- `case 'create-checkout'` (legacy checkout).
- `case 'verify'`.
- No other file, table, RLS policy, or edge function. No frontend change.

## Deployment
After the edit, deploy the function via `supabase--deploy_edge_functions`
(path `viva-wallet`) so the change is live. (Editing the source alone does not
update the running function.)

## Verification
1. Unauthorized POST to the deployed function with `{ action: "webhook",
   orderCode: "any", statusId: "F" }` and **no** `Authorization` header → expect
   `401 {"error":"Unauthorized"}`.
2. Authorized POST (with `Authorization: Bearer <N8N_WEBHOOK_SECRET>`) against a
   test orderCode → expect the existing behaviour (`success: true`), proving the
   guarded path still works for a legitimate caller.
3. Place / inspect a real online checkout end-to-end to confirm the untouched
   `type: 'online'` path still returns a `paymentUrl` and `orderCode` unchanged.

## Risk
Low. The only way this breaks live payments is if Viva Wallet's dashboard is
configured to POST its callback **directly** to this Supabase function (rather
than to n8n). The caller audit contradicts that: Viva posts to n8n, and n8n
updates orders through the already-secret-guarded `confirm-payment`. If the
client wants belt-and-suspenders, the Viva Wallet dashboard webhook URL should
be confirmed to point at n8n (not this function) — but that is a config check,
not a code change.
