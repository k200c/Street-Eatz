
# Post Now: Secure Edge Function Proxy

## Overview

Create a new `post-now` Edge Function that securely proxies "Post Now" requests to n8n, replacing the current insecure direct client-to-n8n call. The function requires JWT authentication, builds a rich payload server-side, and sets status to `posting_queued` (not `published`).

---

## Secret Required

**N8N_POST_NOW_WEBHOOK_URL** must be added with value:
`https://kyle2000.app.n8n.cloud/webhook-test/post-now-instant`

This will be requested via the secrets tool during implementation.

---

## File Changes

### 1. NEW: `supabase/functions/post-now/index.ts`

Complete edge function that:

- **CORS**: Standard headers + OPTIONS handler
- **Auth**: Validates JWT via `getClaims()` -- rejects 401 if missing/invalid
- **Input**: Accepts `{ post_id }`, validates non-empty string
- **Data**: Loads full post from `social_media_posts` using service role client
- **Media normalization**: Handles array, CSV, and JSON-string formats
- **Payload**: Builds the exact required shape:

```json
{
  "event": "post_now",
  "source": "lovable_command_center",
  "timestamp": "<ISO>",
  "idempotency_key": "postnow_<id>",
  "post": {
    "id", "status", "caption", "media_urls",
    "title", "post_type",
    "platforms": ["instagram", "facebook"],
    "account": { "location_name": "Street Eatz Waterford", "brand": "Street Eatz" },
    "meta": { "created_by": "<userId>", "app_env": "prod", "ui_path": "command-center/social/content-queue" }
  }
}
```

- **Retry**: 1 auto-retry after 800ms for network/5xx errors; 4xx fails immediately
- **Status updates**:
  - Success (2xx from n8n): `status = "posting_queued"`
  - Failure: `status = "post_failed"`
- **Response**: `{ success: true, post }` on success, `{ error, status }` on failure (502)

### 2. UPDATE: `supabase/config.toml`

Add at end:

```toml
[functions.post-now]
verify_jwt = false
```

(JWT is validated in-code via `getClaims()` per project convention, since signing-keys system doesn't support `verify_jwt = true`)

### 3. UPDATE: `src/hooks/useSocialMediaPosts.ts`

Replace the `postNowMutation` (lines 425-480) to:

- Get the current auth session token
- Call `/functions/v1/post-now` with `{ post_id }` and the `Authorization` header
- Remove all direct n8n fetch calls and client-side DB status updates (the edge function handles both)
- Update toasts:
  - onSuccess: "Sent to posting pipeline"
  - onError: "Failed to send. Try again."

### 4. No changes needed to `SocialMediaManager.tsx`

The existing `DraftCard` component already has:
- Per-card `isPublishing` local state (line 659)
- `handlePostNow` that sets publishing state and calls `onPostNow` (lines 678-685)
- "Publishing to Socials..." loading UI (lines 757-762)
- Disabled button during posting (line 772)

All of this works unchanged since it calls the same `postNow` function from the hook.

---

## Security Summary

| Concern | Solution |
|---------|----------|
| n8n URL exposed in client | Moved to server-side Deno secret |
| Unauthenticated access | JWT validated via `getClaims()` in edge function |
| Status correctness | `posting_queued` on webhook success, NOT `published` |
| Retry resilience | 1 retry for 5xx/network, immediate fail for 4xx |

---

## Files Modified

| # | File | Action |
|---|------|--------|
| 1 | `supabase/functions/post-now/index.ts` | Create new |
| 2 | `supabase/config.toml` | Add function entry |
| 3 | `src/hooks/useSocialMediaPosts.ts` | Replace postNowMutation |

No database migrations needed.
