# Plan: Compact Mobile PWA Layout

## Problem Summary

The app wastes too much vertical space before product content appears. The hero section, headings, category bar, and footer all consume excessive height on mobile, making the app feel like a landing page rather than a native ordering app.

## Strategy

Introduce a `@media (display-mode: standalone)` CSS layer that compresses spacing specifically for installed PWA mode, plus tighten mobile spacing globally where it's too loose. Desktop/tablet remain unchanged.

## Changes

### 1. `src/index.css` — Add PWA-compact utilities

Add standalone-mode overrides inside the existing `@media (display-mode: standalone)` block:

- Reduce `--nav-height` from 56px to 48px in standalone mode
- Reduce `--bottom-bar-height` from 40px to 32px in standalone mode
- Add a `.pwa-compact` utility that child components can reference

### 2. `src/components/customer/HeroSection.tsx` — Compress hero

- Change `min-h-[38vh]` to `min-h-[28vh]` on mobile (keep `md:min-h-screen` for desktop)
- Reduce `pt-10` to `pt-6`, `pb-6` to `pb-3` on mobile
- Shrink logo from `w-24` to `w-16` on mobile
- Reduce `mb-3` between logo and text to `mb-1`
- Reduce tagline `mb-4` to `mb-2`
- Shrink CTA button padding: `px-3 py-2` instead of `px-4 py-2.5` on mobile
- Hide the "GOURMET STREET FOOD" subtitle on small screens (`hidden sm:block`)
- These changes use existing responsive prefixes, no new utilities needed

### 3. `src/components/customer/MenuSection.tsx` — Tighten menu header + categories

- Reduce section `py-3` to `py-1` on mobile
- Reduce "OUR MENU" heading `mb-2` to `mb-1`, make subtitle smaller or hide on mobile
- Category bar: reduce `py-1.5` to `py-1` on mobile, reduce `mb-3` to `mb-1.5`
- Category pills already use `px-3 py-1.5 text-xs` on mobile — reduce to `py-1`

### 4. `src/components/layout/Navbar.tsx` — Compact header in standalone

- Use CSS variable for height: change `h-14` to `h-12` on mobile via standalone media query (using the updated `--nav-height` variable)

### 5. `src/components/layout/FooterInfoBar.tsx` — Slimmer bottom bar

- Reduce `py-2` to `py-1` on mobile
- Use smaller text `text-[10px]` instead of `text-xs` on mobile
- This makes the bar ~28-32px instead of ~40px

### 6. `src/pages/Index.tsx` — About section spacing

- Reduce `py-10` to `py-6` on mobile for the About section
- Tighten margin between menu and about

### 7. `src/pages/Menu.tsx` — Already uses header offset, just verify padding

- Reduce `pt-[var(--header-offset)]` will auto-adjust with the smaller nav height

### 8. `src/components/layout/BottomNav.tsx` — Compact for standalone

- Reduce `h-16` to `h-14` on mobile (the nav items remain touch-friendly at 56px)

## Files Changed


| File                                      | What                                           |
| ----------------------------------------- | ---------------------------------------------- |
| `src/index.css`                           | Standalone-mode nav/bar height overrides       |
| `src/components/customer/HeroSection.tsx` | Smaller hero, logo, CTA on mobile              |
| `src/components/customer/MenuSection.tsx` | Tighter heading, category bar, section spacing |
| `src/components/layout/Navbar.tsx`        | Use CSS variable for height                    |
| `src/components/layout/FooterInfoBar.tsx` | Slimmer bottom bar                             |
| `src/components/layout/BottomNav.tsx`     | Slightly shorter nav                           |
| `src/pages/Index.tsx`                     | Tighter about section                          |


## Key Decisions

- **CSS variables for heights** so standalone mode automatically propagates smaller sizes to all `calc()` references (floating cart, page padding, etc.)
- **No breakpoint hacks** — uses `@media (display-mode: standalone)` for PWA-specific compression plus standard responsive classes for general mobile tightening
- **Touch targets preserved** — all interactive elements stay ≥44px tap targets
- **Desktop untouched** — all changes scoped to mobile or standalone  
Proceed with this plan, with the following refinements:
  1. Do not rely on hiding important branding text as the main compression strategy. Prefer reducing spacing, heights, and padding first. Only hide secondary subtitle text on very small screens if necessary.
  2. Ensure the first visible product cards move materially higher on screen after the refactor — this is the core success metric.
  3. Apply the same compact spacing logic consistently across all customer-facing pages/components that share the same header/hero/category/content pattern, not just Index.
  4. Keep category chips horizontally scrollable and touch-friendly after size reduction.
  5. Verify that all interactive controls still meet comfortable tap-target sizing on phones.
  6. Avoid over-compressing typography; preserve readability while tightening vertical rhythm.
  7. After implementation, confirm there is no overlap or crowding between:
     - navbar
     - hero
     - category bar
     - floating cart button
     - footer info bar
     - bottom nav
  in both browser mode and standalone PWA mode.