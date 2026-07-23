## Change

Modify **only** `supabase/functions/get-menu/index.ts` to accept an optional `include_unavailable` boolean parameter.

### Parsing
- POST: read `body.include_unavailable`; coerce to boolean only if it's strictly `true` or `"true"`. Anything else (missing, null, unknown type, garbage string) → `false`.
- GET: read `url.searchParams.get("include_unavailable")`; treat `"true"` (case-insensitive) as `true`, everything else as `false`.
- Malformed input never throws — falls through to `false`.

### Query logic
- Default (`false`): keep the existing `.eq("is_available", true)` filter — behaviour identical to today.
- `true`: skip the `.eq("is_available", true)` filter entirely, returning all products regardless of availability.
- `category` and `query` filters continue to apply in both modes, unchanged.

### Response
- Shape, field names, ordering, `success`/`category`/`query`/`count`/`items` structure all unchanged.
- `is_available` is already selected and mapped on every row (`p.is_available ?? true`), so it is present and accurate in both modes.
- Status codes, CORS headers, and error handling unchanged.
- Log line extended to include the new flag for debugging.

### Config
- No change to `supabase/config.toml` — `verify_jwt = false` stays as-is.

## Out of scope (untouched)
- `create-order`, `create-voice-order`, `get-hours`, `get-wait-time`, `get-order-status`, all other edge functions
- Any frontend file, hook, or component
- Any table, RLS policy, or migration

## Verification
After deploy, call the function three ways and confirm:
1. No param → same count as today (available only).
2. `include_unavailable=false` → same as (1).
3. `include_unavailable=true` → count ≥ (1), and at least one row with `is_available: false` appears when unavailable products exist.
