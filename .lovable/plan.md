# Add `get-hours` Edge Function

Create one new Supabase Edge Function, `get-hours`, that reads the `opening_hours` column from `app_settings` and returns it as JSON. No other files, tables, functions, or config are touched.

## Verified
- `app_settings.opening_hours` exists as `Json | null` (confirmed in `src/integrations/supabase/types.ts`), so the query and null-fallback in the provided code are valid.

## Change
- **Create `supabase/functions/get-hours/index.ts`** with the exact code you supplied (uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, both already present as secrets). Always returns HTTP 200 with `{ opening_hours: ... }`, falling back to `null` on missing data or error. CORS preflight handled.

## Notes
- The function is Lovable-managed and deploys automatically with the default `verify_jwt = false`; no `supabase/config.toml` edit is needed.
- Read-only: it only `SELECT`s from `app_settings`. No schema changes, no migrations, no edits to existing functions or frontend code.

## Verification after build
- Deploy `get-hours`, then call it and confirm it returns a 200 with the `opening_hours` JSON payload (or `{ opening_hours: null }` if unset).
