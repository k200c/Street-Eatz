
# Production-Grade PWA Implementation for Street Eatz

## Overview

Transform the Street Eatz web app into a fully installable, offline-capable Progressive Web App with robust update detection. The implementation prioritizes reliability for both customer phones and staff iPads in the food truck environment.

---

## Current State Analysis

| Component | Status |
|-----------|--------|
| `vite-plugin-pwa` | Installed (v1.2.0) but NOT configured |
| PWA Icons | Ready: pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png |
| Theme colors | Already in index.html (#0A0A0A) |
| iOS meta tags | Partially present (apple-touch-icon only) |
| Service Worker | Not implemented |
| Manifest | Not generated |
| Update detection | Not implemented |
| `hardResetApp` utility | Exists - will integrate |

---

## Architecture Overview

```text
VITE BUILD (vite-plugin-pwa)
    │
    ├── Generates manifest.webmanifest
    ├── Generates sw.js (Workbox-powered)
    └── Injects registration code
              │
              ▼
┌─────────────────────────────────────────────────┐
│           SERVICE WORKER CACHING                │
│                                                 │
│  Navigation (HTML): NetworkFirst + offline.html │
│  Static (JS/CSS): CacheFirst (hashed files)    │
│  API (Supabase): NetworkFirst, 5s timeout      │
│  Images: StaleWhileRevalidate                  │
│                                                 │
│  EXCLUDED: /auth, /processing, /functions      │
└─────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│           UPDATE DETECTION FLOW                 │
│                                                 │
│  1. New SW detected via updatefound            │
│  2. UpdateToast appears: "Update available"    │
│  3. User clicks Refresh                        │
│  4. SKIP_WAITING message sent to SW            │
│  5. controllerchange fires → page reloads      │
└─────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `public/offline.html` | Standalone offline fallback page (no React) |
| `src/lib/pwa.ts` | SW registration + update detection logic |
| `src/components/pwa/UpdateToast.tsx` | Persistent update notification banner |

### Modified Files

| File | Changes |
|------|---------|
| `vite.config.ts` | Add VitePWA plugin with manifest + Workbox config |
| `index.html` | Add iOS PWA meta tags |
| `src/main.tsx` | Initialize PWA registration on app boot |
| `src/App.tsx` | Mount UpdateToast component |
| `src/components/layout/SiteFooter.tsx` | Display APP_VERSION |

---

## Technical Implementation Details

### 1. Vite PWA Plugin Configuration

The `vite.config.ts` will be updated with:

**Manifest settings:**
- name: "Street Eatz | Gourmet Street Food"
- short_name: "Street Eatz"
- display: standalone
- theme_color/background_color: #0A0A0A
- Icons: 192x192, 512x512, 512x512 maskable

**Workbox caching strategies:**
- Navigation: NetworkFirst with offline.html fallback
- Supabase API: NetworkFirst with 5s timeout (GET only)
- Static assets: Handled by precache (hashed filenames)
- Images: StaleWhileRevalidate

**Excluded routes (navigateFallbackDenylist):**
- `/auth`
- `/processing`
- `/order-success`
- `/order-failed`
- `/functions`
- Any Supabase function URLs

### 2. Offline Fallback Page

Standalone HTML file that:
- Matches Street Eatz branding (dark theme)
- Displays "You're offline" message
- Has a retry button
- No React dependencies (works when JS fails)

### 3. PWA Registration Module

`src/lib/pwa.ts` will provide:

**Registration:**
- Register SW on app load
- Export registration object for components

**Update detection:**
- Listen for `updatefound` event
- Track `waiting` state of new SW
- Provide `promptForUpdate()` callback

**Update checking schedule:**
- On app load (immediate)
- On `visibilitychange` (tab focus returns)
- On `online` event (network recovery)
- Every 30 minutes via setInterval

**Actions:**
- `checkForUpdates()` - manual check
- `applyUpdate()` - sends SKIP_WAITING + reloads
- Integrates with existing `hardResetApp` for emergency reset

### 4. Update Toast Component

Non-blocking banner that:
- Fixed position at bottom of screen
- Dark theme matching existing Sonner toasts
- Shows "Update available" message
- Refresh button triggers update
- Dismissible with X button
- Only appears when new SW is waiting

### 5. Version Display

Footer will show version in format:
- `v{timestamp}` derived from build time
- Visible for debugging (subtle styling)
- Logged to console on app load

---

## Caching Strategy Summary

| Request Type | Strategy | Notes |
|--------------|----------|-------|
| Navigation (HTML) | NetworkFirst | Falls back to offline.html |
| Static JS/CSS | Precache | Hashed filenames, auto-versioned |
| Supabase API GET | NetworkFirst | 5s timeout, cache fallback |
| Supabase API POST/PUT/DELETE | Network only | Never cached |
| Auth routes | Network only | Excluded from SW |
| Payment routes | Network only | Excluded from SW |
| Images | StaleWhileRevalidate | Show cached, update in background |

---

## Security Safeguards

| Concern | Mitigation |
|---------|------------|
| Auth token caching | Auth routes excluded from SW scope |
| Payment data caching | Payment routes (/processing, /order-*) excluded |
| Stale authenticated data | NetworkFirst with short timeout + React Query staleTime: 0 |
| POST/PUT caching | Workbox only caches GET requests by default |
| Infinite reload loops | Update only triggered by explicit user action |

---

## Update Flow (Step by Step)

```text
1. User opens app
     │
     ├── SW registers (or existing SW runs)
     ├── Check for updates immediately
     └── Start 30-min interval check
              │
2. Background: New SW detected
     │
     ├── updatefound event fires
     ├── New SW installs
     └── New SW enters waiting state
              │
3. App detects waiting SW
     │
     └── UpdateToast appears
              │
4. User clicks "Refresh"
     │
     ├── postMessage('SKIP_WAITING') sent to SW
     ├── New SW activates (skipWaiting + clientsClaim)
     └── controllerchange fires → window.location.reload()
              │
5. Fresh app loads with new version
```

---

## Testing Checklist

### Installability
1. Open Chrome DevTools → Application → Manifest
2. Verify all manifest fields populated
3. Check "Installable" status (no errors)
4. Test "Add to Home Screen" on Android
5. Test "Add to Home Screen" on iOS Safari

### Offline Mode
1. DevTools → Network → Offline checkbox
2. Refresh page → Should see offline.html
3. Go back online → App works normally
4. Test with poor network (Slow 3G throttle)

### Update Detection
1. Make a visible code change
2. Rebuild and redeploy
3. Refresh existing tab → UpdateToast should appear
4. Click Refresh → New version loads
5. Check version in footer changed

### Cache Behavior
1. Load app, go offline
2. Navigate between cached pages (Menu, Index)
3. Try to access /auth → Should fail gracefully
4. Try to checkout → Should require network

---

## Production Launch Checklist

- [ ] Manifest validates in Chrome DevTools
- [ ] All icons load correctly (192, 512, maskable)
- [ ] App installable on iOS Safari
- [ ] App installable on Android Chrome
- [ ] Offline fallback page displays correctly
- [ ] Update toast appears when new version deployed
- [ ] Refresh button applies update and reloads
- [ ] Version visible in footer
- [ ] Version logged to console
- [ ] Auth routes NOT cached
- [ ] Payment routes NOT cached
- [ ] Lighthouse PWA audit passes
- [ ] Staff iPad testing completed
- [ ] Customer phone testing completed

---

## Integration Notes

### With Existing hardResetApp
The UpdateToast will include an "Emergency Reset" option that calls the existing `hardResetApp()` function for full cache clearing.

### With React Query Settings
The existing `staleTime: 0` and `gcTime: 0` settings complement the NetworkFirst API strategy, ensuring fresh data.

### With Auth System
Auth routes are explicitly excluded from SW caching to prevent token/session issues.

### With Payment Flow
All Viva Wallet redirect routes (/processing, /order-success, /order-failed) are excluded from SW caching to maintain payment reliability.
