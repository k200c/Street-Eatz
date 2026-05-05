# Fix publicSupabase lock isolation

## Problem
`publicSupabase` doesn't set `storageKey`, so it inherits the default. In supabase-js v2 the `navigator.locks` key is derived from `storageKey`, meaning both clients share the same lock — public reads still block on the main client's token refresh.

## Change
Single file: `src/integrations/supabase/client.ts`

Inside the `publicSupabase` auth config, add:
- `storageKey: 'sb-public-readonly'` — unique lock namespace
- `detectSessionInUrl: false` — don't parse URL hash
- `storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }` — no-op storage so nothing leaks to localStorage

Keep existing `persistSession: false` and `autoRefreshToken: false`.

Main `supabase` client untouched. No other files change.
