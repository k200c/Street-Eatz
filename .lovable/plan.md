

# Plan: Fix Mobile PWA Standalone Layout

## Root Causes

1. **FooterInfoBar (h-10 fixed bottom) collides with FloatingCartButton** — both use `bottom: 0` / calculated bottom offsets but don't account for each other consistently.
2. **No `display-mode: standalone` media query** — the app has no CSS differentiation between browser and PWA mode, meaning safe-area spacing isn't adjusted for the absent browser chrome in standalone mode.
3. **Inconsistent bottom padding** — pages use varying `pb-16`, `pb-20`, `pb-24`, `pb-28`, `pb-40` without a unified system that accounts for the FooterInfoBar (40px) + safe area.
4. **`min-h-screen` used everywhere** — while `100dvh` is used in the mobile menu overlay, other pages still use `min-h-screen` (which maps to `100vh` and can overshoot on mobile Safari with dynamic toolbar).
5. **Navbar height mismatch** — CSS variable `--nav-height: 56px` but the actual navbar inner `h-14` = 56px, which is correct. However the navbar also adds `paddingTop: var(--safe-top)` making total height = 56px + safe-area, which `--header-offset` correctly handles. No issue here.
6. **FloatingCartButton bottom calc** — uses `calc(2.75rem + var(--safe-bottom) + 0.5rem)` which is ~52px, but the FooterInfoBar is 40px + safe-area-bottom padding. These overlap when FooterInfoBar is present.

## Changes

### 1. `src/index.css` — Add PWA layout utilities and standardize bottom spacing

- Add a CSS variable `--bottom-bar-height: 40px` for the FooterInfoBar
- Add `--bottom-offset: calc(var(--bottom-bar-height) + var(--safe-bottom))` for content that needs to clear both
- Add `@media (display-mode: standalone)` rules to ensure safe-area is applied in PWA mode
- Change `min-height: 100vh` default to `min-height: 100dvh` with `100vh` fallback in the body

### 2. `src/components/customer/FloatingCartButton.tsx` — Fix bottom position

- Change bottom calc to sit above the FooterInfoBar: `calc(var(--bottom-bar-height, 40px) + var(--safe-bottom, 0px) + 0.75rem)`

### 3. `src/components/layout/FooterInfoBar.tsx` — Ensure safe-area padding works in standalone

- The component already uses `safe-area-pb` class. Verify the `h-10` accounts for the padding correctly — change to `min-h-[40px]` so safe-area padding extends it rather than being clipped.

### 4. `src/pages/Index.tsx` — Standardize bottom padding

- Change `pb-16` to use the bottom offset variable so content clears FooterInfoBar + safe area

### 5. `src/pages/Menu.tsx` — Standardize bottom padding  

- Ensure `pb-24` is sufficient (it needs to clear FloatingCartButton + FooterInfoBar + safe area)

### 6. `src/pages/Cart.tsx` — Fix checkout button bottom spacing

- The fixed checkout button uses `safe-area-pb` but needs to also account for FooterInfoBar height if it's visible. Cart page doesn't show FooterInfoBar directly but uses `pb-40` which is adequate.

### 7. `src/pages/Details.tsx` — Add BottomNav safe-area padding

- Already uses `pb-24` which should be sufficient with the BottomNav.

### 8. `src/components/layout/CustomerLayout.tsx` — Update bottom padding

- Change `pb-20` to account for the bottom nav bar + safe area properly in standalone mode.

## Files Changed

| File | Change |
|------|--------|
| `src/index.css` | Add `--bottom-bar-height`, standalone media query, `100dvh` fallback |
| `src/components/customer/FloatingCartButton.tsx` | Fix bottom position to clear FooterInfoBar |
| `src/components/layout/FooterInfoBar.tsx` | Use `min-h-[40px]` instead of `h-10` for safe-area expansion |
| `src/pages/Index.tsx` | Standardize bottom padding |
| `src/pages/Menu.tsx` | Verify/adjust bottom padding |
| `src/components/layout/CustomerLayout.tsx` | Adjust `pb-20` for standalone mode |

## How It Works

The key insight: in standalone PWA mode, there's no browser URL bar or bottom toolbar, so `100vh` matches `100dvh`. But on iOS Safari in browser mode, `100vh` includes the area behind the URL bar. Using `100dvh` with a `100vh` fallback handles both cases.

For bottom spacing, introducing `--bottom-bar-height` as a CSS variable creates a single reference point that the FloatingCartButton and page padding can both use, preventing collision.

The `@media (display-mode: standalone)` query allows fine-tuning specifically for PWA mode if needed (e.g., ensuring the status bar area has proper background color bleed).

