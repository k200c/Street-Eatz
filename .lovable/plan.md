
# Fix: Auth Boot Timeout Race Condition

## Root Cause Analysis

The app is stuck on "Complete Your Profile" due to a race condition in the authentication flow:

```text
Timeline of Events:
┌─────────────────────────────────────────────────────────────┐
│  0ms   → AuthProvider mounts, bootTimeout starts (5s)       │
│  ~50ms → initSession() calls getSession()                   │
│  ~200ms → getSession returns, sets loading: false           │
│  ~250ms → fetchUserData() starts, profileLoading: true      │
│  5000ms → bootTimeout fires! Checks state.loading (false)   │
│           BUT profile fetch may still be in progress...     │
│           applyManualCleanup() wipes session & profile      │
│           User is logged out mid-flow!                      │
└─────────────────────────────────────────────────────────────┘
```

The boot timeout (5 seconds) is racing against the profile fetch. When the timeout check runs, it only looks at `state.loading` - but after `initSession()` completes, `loading` becomes `false` even though `profileLoading` is still `true`.

This causes the profile to appear as `null` intermittently, triggering the "Complete Your Profile" screen even when the user has a complete profile.

## The Fix

Restructure the authentication initialization to follow the pattern from the Stack Overflow solution: **Initial load awaits all async operations before setting loading to false**.

### Changes to AuthContext.tsx

1. **Remove the aggressive boot timeout** that fires while profile is loading
2. **Keep `loading: true` until both session AND profile data are loaded**
3. **Set up `onAuthStateChange` BEFORE calling `getSession()`** to avoid race conditions
4. **Separate initial load from ongoing auth changes** - only initial load should control the loading state

### Updated Architecture

```text
NEW Timeline (Fixed):
┌─────────────────────────────────────────────────────────────┐
│  1. Set up onAuthStateChange listener FIRST                 │
│  2. Call getSession() to check for existing session         │
│  3. If session exists, await fetchUserData() to complete    │
│  4. ONLY THEN set loading: false                            │
│  5. Subsequent auth changes update state but don't          │
│     affect loading (it's already false)                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Code Changes

**File: `src/contexts/AuthContext.tsx`**

- Refactor `useEffect` to await profile fetch during initial load
- Remove boot timeout that triggers `applyManualCleanup()` during normal operation
- Keep the timeout but only trigger it if `getSession()` itself hangs (network issue)
- Ensure `loading` remains `true` until profile data is available

**Current (broken):**
```typescript
setState(prev => ({ ...prev, loading: false })); // Sets loading false BEFORE profile fetch
if (session?.user) {
  fetchUserData(session.user.id); // Profile fetch starts AFTER loading is false
}
```

**Fixed:**
```typescript
if (session?.user) {
  await fetchUserData(session.user.id); // AWAIT profile fetch
}
// THEN set loading false
setState(prev => ({ ...prev, loading: false }));
```

### Additional Improvements

1. **Add autocomplete attributes** to Input fields to fix the DOM warnings
2. **Keep a safety timeout** (10s) but only for true network failures, not normal operation
3. **Pre-populate form fields** in Auth.tsx with data from user metadata to prevent showing empty form

## Files to Modify

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Restructure auth initialization to await profile data |
| `src/pages/Auth.tsx` | Pre-populate profile form from user metadata, add autocomplete attributes |

## Expected Outcome

After this fix:
- User logs in successfully
- Profile data loads before `loading` becomes `false`
- Auth.tsx correctly sees `profile.full_name` and `profile.phone` exist
- User is redirected to `/admin/pos` or `/menu` instead of showing "Complete Your Profile"
- No more "[Auth] Boot timeout" console warnings during normal operation
