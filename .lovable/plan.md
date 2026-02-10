
# Update `update-social-post` Edge Function to Accept `media_urls`

## Problem
The edge function ignores `media_urls` from n8n payloads, so drafted posts never get their media persisted.

## Solution
Single file change: `supabase/functions/update-social-post/index.ts`

### Changes

1. **Update `UpdatePostPayload` interface** -- add `media_urls?: string[] | string` to accept all incoming formats.

2. **Add `parseMediaUrls` helper** (inline in same file) that normalizes any of the three input formats into a clean `string[]`:
   - If already an array: trim each entry, filter empties.
   - If a string starting with `[`: try `JSON.parse`, then trim/filter.
   - If a plain string: split on `,`, trim each, filter empties.
   - If parsing fails: throw with a descriptive message (caught and returned as 400).

3. **Widen `updateData` type** from `Record<string, string>` to `Record<string, string | string[]>` so the array can be stored directly (the column is `text[]` in Postgres, Supabase JS client handles array binding natively).

4. **Add `media_urls` to updateData** when present in payload, after parsing.

5. **Update the "no fields" check message** to mention `media_urls` as an accepted field.

6. **Add logging** -- log which format was detected (array / csv / json-string) and the resulting count, plus the incoming payload keys. No secrets logged.

7. **Consistent response shape** -- responses already use `{ success, post }` or `{ error }`. Keep this pattern; rename `post` to `data` in the success path for consistency with the requirements (or keep `post` for backward compat -- will keep `post` since existing consumers may depend on it, and add `data` as an alias).

### Validation Logic

```
if media_urls is provided:
  if Array.isArray -> use directly, trim+filter
  if typeof string:
    if starts with "[" -> JSON.parse, validate is array, trim+filter
    else -> split(","), trim+filter
  else -> return 400 "media_urls must be array or string"
```

### What n8n Should Send
- **Preferred**: actual JSON array `"media_urls": ["url1", "url2"]`
- **Also works**: CSV string `"media_urls": "url1,url2"` or JSON-stringified array

### File Modified
| File | Change |
|------|--------|
| `supabase/functions/update-social-post/index.ts` | Add media_urls parsing, validation, persistence |

### No Breaking Changes
- Existing payloads with only `post_id`/`status`/`generated_caption` work identically
- Response shape preserved (`{ success: true, post: data }` / `{ error: "..." }`)
- CORS headers unchanged
- No database migration needed (column already exists as `text[]`)
