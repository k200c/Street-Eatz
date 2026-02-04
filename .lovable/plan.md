
# Production-Grade PWA + Profile Fix Implementation

## Root Cause Summary

### PWA Issue
The `vite-plugin-pwa` is configured with `injectRegister: false`, meaning the app manually registers `/sw.js`. However, this file only exists **after a production build**. On Lovable preview domains (`id-preview--*`), `/sw.js` returns HTML from the SPA router, causing the MIME type error.

### Profile Completion Issue
Lines 62-79 of `Auth.tsx` force users to `step = 'profile'` if `!profile?.full_name || !profile?.phone`. Combined with 8-second profile fetch timeouts, users get stuck in an infinite spinner.

---

## Implementation Plan

### Phase 1: Fix PWA Registration with Smart Detection

**File: `src/lib/pwa.ts`**

Replace the current naive registration with:

1. **Skip known preview domains** - Check if hostname contains `id-preview--` (Lovable preview pattern)
2. **Content-type validation as source of truth** - Fetch `/sw.js` with `{ cache: 'no-store' }` and verify:
   - `response.ok === true` (200 status)
   - `content-type` header includes `javascript`
3. **Only register if SW file is valid JavaScript**
4. **Graceful degradation** - Log warnings, never throw errors

```typescript
// New registerSW() logic:

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service workers not supported');
    return null;
  }

  // Skip known preview environments where SW won't exist
  const hostname = window.location.hostname;
  if (hostname.includes('id-preview--')) {
    console.log('[PWA] Preview environment detected, skipping SW registration');
    return null;
  }

  try {
    // Validate SW file exists and is JavaScript before registering
    const swResponse = await fetch('/sw.js', { 
      method: 'HEAD',
      cache: 'no-store' 
    });
    
    if (!swResponse.ok) {
      console.warn('[PWA] SW file not available (status:', swResponse.status, ')');
      return null;
    }
    
    const contentType = swResponse.headers.get('content-type') || '';
    if (!contentType.includes('javascript')) {
      console.warn('[PWA] SW has wrong MIME type:', contentType, '- skipping registration');
      return null;
    }

    // SW file is valid, proceed with registration
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    
    // ... rest of setup code
  } catch (error) {
    console.error('[PWA] Service worker registration failed:', error);
    return null;
  }
}
```

---

### Phase 2: Remove Profile Gating Entirely

**File: `src/pages/Auth.tsx`**

**Current problematic code (lines 62-79):**
```typescript
useEffect(() => {
  if (loading || profileLoading) return;
  
  if (user) {
    // THIS BLOCKS THE USER:
    if (!profile?.full_name || !profile?.phone) {
      setStep('profile');
      return;
    }
    
    // Redirect based on role
    if (role === 'admin') {
      navigate('/admin/pos', { replace: true });
    } else {
      navigate(from, { replace: true });
    }
  }
}, [...]);
```

**Fixed code - remove profile gating:**
```typescript
useEffect(() => {
  if (loading || profileLoading) return;
  
  if (user) {
    // REMOVED: Profile completion check - never block app access
    // Users can complete profile later via Settings or at checkout
    
    // Redirect based on role immediately
    if (role === 'admin') {
      navigate('/admin/pos', { replace: true });
    } else {
      navigate(from, { replace: true });
    }
  }
}, [user, role, loading, profileLoading, navigate, from]);
```

**Add "Skip for now" to profile form (for edge cases if user manually accesses /auth):**

Add after line 432 (after the Complete Profile button):
```typescript
<button
  type="button"
  onClick={() => {
    toast.info('You can complete your profile later in Settings');
    if (role === 'admin') {
      navigate('/admin/pos', { replace: true });
    } else {
      navigate(from, { replace: true });
    }
  }}
  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
  disabled={submitting}
>
  Skip for now
</button>
```

---

### Phase 3: Make Profile Save Non-Blocking with Timeout

**File: `src/pages/Auth.tsx` - handleCompleteProfile function**

Add timeout wrapper and enforce `finally { setSubmitting(false) }`:

```typescript
const handleCompleteProfile = async (e: React.FormEvent) => {
  e.preventDefault();
  setSubmitting(true);

  try {
    const validation = profileSchema.safeParse({ fullName, phone });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return; // finally will still run
    }

    // Add 10-second timeout to prevent infinite spinner
    const savePromise = updateProfile({
      full_name: fullName.trim(),
      phone: phone.trim(),
    });
    
    const timeoutPromise = new Promise<{ error: Error }>((resolve) =>
      setTimeout(() => resolve({ error: new Error('Save timed out') }), 10000)
    );

    const { error } = await Promise.race([savePromise, timeoutPromise]);

    if (error) {
      toast.error(error.message || 'Failed to update profile. You can try again in Settings.');
      // Still navigate - don't block the user
      setTimeout(() => {
        if (role === 'admin') {
          navigate('/admin/pos', { replace: true });
        } else {
          navigate(from, { replace: true });
        }
      }, 1500);
      return;
    }

    setStep('success');
    toast.success('Profile complete!');
    
    setTimeout(() => {
      if (role === 'admin') {
        navigate('/admin/pos', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }, 1500);
  } catch (error: any) {
    toast.error('Failed to update profile. You can try again later.');
    // Navigate anyway after error
    setTimeout(() => {
      if (role === 'admin') {
        navigate('/admin/pos', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }, 1500);
  } finally {
    // CRITICAL: Always clear loading state
    setSubmitting(false);
  }
};
```

---

### Phase 4: Reduce AuthContext Timeout

**File: `src/contexts/AuthContext.tsx`**

Change profile fetch timeout from 8s to 5s for faster recovery:

```typescript
// Line 86-87: Change timeout from 8000 to 5000
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
);
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/pwa.ts` | Add preview domain check + content-type validation before SW registration |
| `src/pages/Auth.tsx` | Remove profile gating (lines 67-70), add "Skip for now" button, add timeout to save |
| `src/contexts/AuthContext.tsx` | Reduce profile fetch timeout from 8s to 5s |

---

## Verification Steps

### PWA Fix Verification

1. **Preview domain test:**
   - Open app on `id-preview--*.lovable.app` domain
   - Open DevTools Console
   - Should see: `[PWA] Preview environment detected, skipping SW registration`
   - No MIME type errors

2. **Production domain test:**
   - Deploy to production (`urban-eats-suite.lovable.app`)
   - Open DevTools → Application → Service Workers
   - SW should be registered and active
   - Should see: `[PWA] Service worker registered, scope: /`

3. **Fallback test (SW missing on non-preview):**
   - If `/sw.js` returns non-JS, should see: `[PWA] SW has wrong MIME type: text/html - skipping registration`
   - App continues working without PWA

### Profile Fix Verification

1. **Login without profile data:**
   - Create new account OR clear profile data
   - Sign in
   - Should redirect directly to `/menu` (customer) or `/admin/pos` (staff)
   - NO "Complete your profile" blocking screen

2. **Skip option test:**
   - If profile step somehow appears, click "Skip for now"
   - Should navigate to app with toast: "You can complete your profile later in Settings"

3. **Timeout test:**
   - Throttle network to Slow 3G
   - Sign in
   - Should proceed within 5 seconds even if profile fetch times out
   - No infinite spinner

4. **Save timeout test:**
   - If completing profile with very slow network
   - Save should timeout after 10s
   - Should show error toast and still navigate to app

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Preview domain (`id-preview--*`) | SW skipped, no errors |
| Production + SW available | Normal PWA registration |
| Production + SW missing (404) | Graceful skip, warning logged |
| Production + SW wrong MIME | Graceful skip, warning logged |
| Profile fetch timeout | Proceeds with `role='customer'`, no blocking |
| Profile missing in DB | Proceeds to app, can complete later |
| Profile save timeout | Error toast, navigates anyway |
| RLS denial on profile | Proceeds anyway, shows error toast |
