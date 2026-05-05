# Auth Lock Deadlock Fix

Surgical replacement of two files to eliminate the `getSession()` lock contention causing infinite menu skeletons and false logged-out state on refresh.

## Root cause

`supabase.auth.getSession()` acquires an internal async lock. When the stored access token is expired, it triggers `refreshSession()` over the network while holding that lock. Every Supabase REST call (products, app_settings, profiles, has_role, etc.) internally calls `getSession()` too — so they all queue behind the stuck lock and hang. Compounded by `gcTime: 0`, every auth-driven remount wipes the query cache and fires a parallel refetch storm that all land in `isLoading=true` at once.

## Changes

### 1. `src/contexts/AuthContext.tsx`

- Remove `supabase.auth.getSession()` from boot entirely. No `initSession()` function.
- Drive initial auth state from `onAuthStateChange` — the `INITIAL_SESSION` event fires synchronously from localStorage with no network call and no lock acquisition.
- Event handling inside the listener:
  - `INITIAL_SESSION`: set session/user, set `loading: false`, mark `loadingCompleted.current = true`, kick off background `fetchUserData` (no await) if user present.
  - `SIGNED_IN`: set session/user, background `fetchUserData`.
  - `TOKEN_REFRESHED`: update session silently, no profile refetch.
  - `SIGNED_OUT` / `USER_DELETED`: clear role, profile, session, user.
  - `USER_UPDATED`: update user object.
- Remove `isInitialLoad` ref. Keep `isMounted`, `loadingCompleted`, `clearAuthStorage`, `applyManualCleanup`, `fetchUserData` (with its 5s race), `signIn`, `signUp`, `signInWithOtp`, `signInWithPhoneOtp`, `verifyOtp`, `verifyPhoneOtp`, `signOut`, `updateProfile` exactly as-is.
- Reduce safety timeout from 15s to 5s (INITIAL_SESSION normally fires <100ms). Still gated on `loadingCompleted.current`.
- Keep `setTimeout(0)` deferral around `fetchUserData` calls inside the listener to avoid Supabase client deadlock guidance.

### 2. `src/App.tsx`

- One-line change in `QueryClient` defaults: `gcTime: 0` → `gcTime: 1000 * 60 * 5`.
- Leave everything else unchanged: `staleTime: 0`, `retry: 1`, `refetchOnWindowFocus: false`, all routes, providers, imports.

## Explicitly NOT touched

- `src/components/auth/AuthGuard.tsx`
- `src/integrations/supabase/client.ts`
- Any payment / checkout / cart / order / KDS / receipt / n8n / Viva / myPOS code
- Edge functions, RLS policies, database schema
- Routes, providers, layout, PWA kill-switch (`public/sw.js`, `src/main.tsx`, `src/lib/pwa.ts`)

## Why this fixes it

- No `getSession()` on boot → no lock acquisition → no refresh-blocking → REST calls (products, app_settings, has_role, profiles) run immediately.
- `INITIAL_SESSION` reads from localStorage synchronously, so app shell renders in tens of ms instead of waiting on a network refresh.
- `gcTime: 5min` keeps query results across remounts, so an auth state change no longer triggers a full parallel refetch storm where every hook simultaneously reports `isLoading: true` (which is what was producing the menu skeleton flash).
- `TOKEN_REFRESHED` is handled silently in the background — the user never sees a loading state for a routine token refresh.
- `SIGNED_OUT` from an expired refresh token cleanly resets state instead of leaving the app stuck.

## Test checklist

- Refresh while logged in on `/`, `/menu`, `/cart`, `/profile`, `/admin` — no skeleton hang, no `[Auth] Safety timeout`, no false logged-out flash.
- Refresh while logged out on `/menu` — products load, no auth required.
- Login → redirect works (admin → `/admin`, customer → `/menu`).
- Sign out → state clears, redirect to `/auth` from protected routes.
- Leave tab idle past token expiry → `TOKEN_REFRESHED` fires silently, no UI flicker.
- Payment redirect routes (`/processing`, `/order-success`, `/order-failed`) still public and functional.

## Rollback

Revert both files via project history. No schema/edge-function/secret changes to undo.

## Remaining risks

- If `INITIAL_SESSION` fails to fire (unlikely; it is contractually emitted by supabase-js v2 on listener attach), the 5s safety timeout still releases the loading gate.
- Increasing `gcTime` means slightly stale data may be shown briefly across navigations; `staleTime: 0` ensures background refetch still happens, so this is purely a perceived-latency improvement, not a correctness change.
