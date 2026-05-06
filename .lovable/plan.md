## Fix: Cart wipe on add + silent sign-out hang

Two surgical fixes to eliminate the `navigator.locks` deadlock that wipes freshly-added cart items on hard refresh and causes sign-out to hang.

### Fix 1 — `src/hooks/useCartSync.ts`
Stop calling `supabase.auth.getSession()` at boot (it grabs the auth lock and leaves `cartStore.userId` null long enough for an "Add to Cart" tap to be written to the guest cart, then overwritten when Supabase load runs).

- Remove `import { supabase } from '@/integrations/supabase/client'`.
- Remove the `initSync` block and the `supabase.auth.onAuthStateChange` listener entirely.
- Read auth state from `useAuthContext()` (`user`, `loading`).
- Single `useEffect` with deps `[user?.id, loading, syncWithUser]`: when `loading === false`, call `syncWithUser(user?.id ?? null)`. AuthContext is the single source of truth for auth events.

### Fix 2 — `src/contexts/AuthContext.tsx` (signOut only)
Make sign-out always release UI state, even if the server call hangs.

- Wrap `supabase.auth.signOut({ scope: 'global' })` in `Promise.race` against a 3s timeout.
- Use try / catch / `finally` — call `applyManualCleanup()` in `finally` so local state resets on success, error, or timeout.
- No other changes to `AuthContext` (INITIAL_SESSION flow, fetchUserData, safety timeout, etc. all stay).

### Strictly NOT touched
`cartStore.ts`, `supabase/client.ts` (publicSupabase stays), `AuthGuard`, `App.tsx`, `manifest.webmanifest`, `sw.js`, all checkout modals, `useCheckout`, KDS, payments, n8n, RLS, schema, edge functions.

### Verification
- Hard refresh `/menu` while logged in → immediately tap "Add to Cart" → item persists in cart (not wiped).
- Sign out → completes within 3s even with throttled network.
- Logged-out flow still loads guest cart from localStorage.
