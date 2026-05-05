# Auth Boot Deadlock Fix

Two surgical file replacements to fix the black-screen-on-refresh bug for authenticated users.

## Root cause

1. `AuthContext.initSession` awaits `fetchUserData` (has_role RPC + profiles SELECT, up to 5s) before clearing `loading`. The whole app is gated on this, so AuthGuard shows a spinner — and on `/details` (a static page wrongly behind AuthGuard) the user sees a black/spinner screen on every refresh.
2. The 15s safety timeout reads `state.loading` from a stale closure (the effect only runs once with `loading: true`), so the warning logic is unreliable and never re-evaluates.
3. `/details` is wrapped in `AuthGuard` even though it's a static info page (hours/address/phone) — it should be public.

## Fix

### 1. `src/contexts/AuthContext.tsx`

- Add `loadingCompleted = useRef(false)` to track init completion without stale closure.
- In `initSession`: after `getSession()` resolves, set `session`/`user` AND `loading: false` immediately. Then kick off `fetchUserData` in the background (no await). `profileLoading` covers the profile fetch state.
- Safety timeout reads `loadingCompleted.current` instead of `state.loading`; only fires if init never completed.
- Keep everything else (signIn/signUp/signOut/updateProfile/OTP, manualCleanup, onAuthStateChange listener with `setTimeout(0)` deadlock guard) unchanged.

### 2. `src/App.tsx`

- Change `<Route path="/details" element={<AuthGuard><Details /></AuthGuard>} />` to `<Route path="/details" element={<Details />} />`.
- No other route, provider, or import changes.

## Explicitly NOT touched

- `src/components/auth/AuthGuard.tsx`
- `src/integrations/supabase/client.ts`
- Any payment / checkout / cart / order / KDS / receipt / n8n code
- RLS policies, edge functions, database schema
- All other routes (cart, account, profile, admin, payment redirects)

## Why this fixes it

- App shell renders as soon as the session is known (typically <200ms), instead of waiting for two RLS-protected queries.
- Profile/role load in the background; components that need them already handle `profileLoading`.
- `/details` no longer hits AuthGuard at all, so a refresh on that page never blocks on auth.
- Safety timeout now correctly distinguishes "init never finished" from "init finished, profile still loading".

## Test checklist

- Refresh while logged in on `/`, `/menu`, `/details`, `/profile`, `/admin` — no black screen, no `[Auth] Safety timeout` warning.
- Logged-out refresh on protected route → redirects to `/auth`.
- Login flow works; admin redirects work.
- Payment redirect routes (`/processing`, `/order-success`, `/order-failed`) unchanged.

## Rollback

Revert the two files via project history.
