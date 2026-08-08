# Plan: Add `include_unavailable` to `get-menu` Edge Function

## Current State
The requested behavior is already present in `supabase/functions/get-menu/index.ts`:

- **POST parsing** (lines 48-51): `body.include_unavailable === true` or string `"true"` (case-insensitive) sets the flag to `true`; everything else defaults to `false`.
- **GET parsing** (lines 56-57): `url.searchParams.get("include_unavailable")` compared lowercase to `"true"`; everything else defaults to `false`.
- **Malformed input** (line 45): `req.json().catch(() => ({}))` swallows parse errors and falls through to `includeUnavailable = false`.
- **Default behavior** (lines 99-101): when `includeUnavailable` is `false`, the existing `.eq("is_available", true)` filter is applied — identical to today’s behavior.
- **When true** (lines 99-101): the availability filter is skipped, returning all products.
- **`is_available` field** (line 126): included on every returned row.
- **Other filters** (lines 103-109): `category` and `query` filters apply unchanged in both modes.
- **Response / CORS / auth** (lines 138-149, 3-6, 36-38): unchanged.

## Proposed Work
No source-code changes are required. The plan is to verify the existing implementation with targeted tests:

1. Run the existing Deno tests for `get-menu` (if present).
2. If no tests exist, deploy the function and curl it with the following cases:
   - POST with `include_unavailable: true` → expect unavailable products included.
   - POST with `include_unavailable: "true"` → expect unavailable products included.
   - POST with `include_unavailable: "True"` → expect unavailable products included.
   - POST with `include_unavailable: false` → expect only available products.
   - POST with `include_unavailable: "yes"` → expect only available products.
   - POST with malformed JSON body → expect only available products, no 500.
   - GET with `?include_unavailable=true` → expect unavailable products included.
   - GET with `?include_unavailable=TRUE` → expect unavailable products included.
   - GET with `?include_unavailable=false` → expect only available products.
   - GET with `?include_unavailable=1` → expect only available products.
3. Confirm `is_available` is present and accurate on every item in all responses.
4. Confirm category and query filters still work with `include_unavailable=true`.

## Files Touched
None. Verification only.

## Rollback
Not applicable — no changes made.
