# Mobile-First PWA Polish Plan

## What's Wrong

1. **Hero is ~50vh minimum on mobile** — too tall. Logo (w-32), two large headings, tagline, and 3 stacked buttons push the menu far below the fold.
2. **CTA buttons stack vertically with py-4/py-6** — consuming ~180px+ of vertical space on mobile.
3. **FooterInfoBar uses py-3 + h-12** — slightly wasteful; the fixed bottom bar plus FloatingCartButton at `bottom-20` creates stacking issues.
4. **100vh used for body min-height** — breaks on iOS Safari with dynamic toolbar.
5. **No dvh fallback** — missing modern viewport unit support.
6. **Safe-area utilities are minimal** — only `safe-area-pb` and `safe-area-bottom` exist; no top/left/right padding utilities.
7. **Category sticky bar uses `top-16**` — doesn't account for safe-area-inset-top, causing overlap under notch.
8. **Scroll indicator at `bottom-16**` on mobile wastes space and overlaps the FooterInfoBar.

## Changes

### 1. `src/index.css` — Viewport & safe-area hardening

- Add `min-height: 100dvh` with `100vh` fallback on body
- Add safe-area utility classes: `.safe-area-pt`, `.safe-area-pl`, `.safe-area-pr`
- Add a reusable `.app-container` class for consistent max-width + centering + overflow prevention

### 2. `src/components/customer/HeroSection.tsx` — Compact mobile hero

- Reduce `min-h-[50vh]` → `min-h-[40vh]` on mobile (keep `md:min-h-screen` for desktop)
- Shrink logo: `w-24` on mobile (from `w-32`)
- Reduce `mb-6` on logo container → `mb-3`
- Use `clamp()` for headings: h1 from `text-4xl` → `text-[clamp(1.75rem,6vw,3rem)]`, h2 similarly
- Tighten text stack: `space-y-0.5` and `mb-3` on mobile
- Reduce tagline margin: `mb-4` (from `mb-6`)
- Make CTA buttons horizontal on mobile too: `flex-row flex-wrap justify-center gap-2`
- Shrink button padding: `px-4 py-2.5` on mobile (from `px-6 py-4`), text `text-xs`
- Remove bounce chevron on mobile (hidden below `sm:`)

### 3. `src/components/layout/FooterInfoBar.tsx` — Compress bottom bar

- Reduce height: `h-10` (from `h-12`), `py-2` (from `py-3`)
- Smaller text on mobile: `text-xs`
- Tighten icon sizes on mobile

### 4. `src/components/customer/FloatingCartButton.tsx` — Safe-area aware

- Change `bottom-20` to `bottom-14` to account for compressed footer bar
- Add safe-area-bottom offset via inline style

### 5. `src/components/customer/MenuSection.tsx` — Sticky bar fix

- Change sticky `top-16` to use `top-[var(--header-offset)]` so it respects safe-area
- Reduce `py-6` → `py-3` on mobile for the section top padding

### 6. `src/pages/Index.tsx` — Tighten page spacing

- Reduce `pb-24` → `pb-16` to tighten bottom space
- About section: reduce `py-16` → `py-10` on mobile

### 7. `index.html` — Add missing PWA meta

- Add `<meta name="mobile-web-app-capable" content="yes" />` (already has apple version)  
  
Before implementation, extend this plan with the following non-negotiable additions:
  ### Additional Required Fixes
  #### A. Global overflow protection
  Prevent accidental horizontal scrolling across the app:
  - set `html, body, #root { width: 100%; overflow-x: hidden; }`
  - ensure major layout wrappers use `max-w-full`
  - audit category rails, buttons, hero wrappers, and bottom bars for overflow-causing widths or transforms
  #### B. Centralize safe-area and sticky offsets
  In `src/index.css`, define reusable CSS variables:
  - `--safe-top: env(safe-area-inset-top, 0px)`
  - `--safe-bottom: env(safe-area-inset-bottom, 0px)`
  - `--safe-left: env(safe-area-inset-left, 0px)`
  - `--safe-right: env(safe-area-inset-right, 0px)`
  - `--header-offset` based on actual header height + safe top inset
  Use these variables consistently in:
  - header/nav
  - sticky category bar
  - FooterInfoBar
  - FloatingCartButton
  - drawers/modals/sheets if applicable
  #### C. Header audit
  Refine the mobile header itself:
  - slightly reduce mobile header height/padding
  - ensure safe-area top is respected
  - ensure header icons remain minimum 44x44 tap targets
  - confirm sticky/fixed header does not overlap hero or categories
  #### D. Category chip rail polish
  Improve the horizontal category selector:
  - `overflow-x-auto`
  - hidden scrollbar
  - `whitespace-nowrap`
  - `shrink-0` pills
  - left/right padding so chips don’t touch screen edges
  - iOS smooth scrolling support
  - optional snap behavior if it feels natural
  #### E. PWA shell audit
  Verify the PWA foundation:
  - manifest `display`, `background_color`, `theme_color`
  - proper icons and Apple touch icon
  - include maskable icon if available
  - ensure browser chrome/app chrome colors match the StreetEatz theme
  #### F. Acceptance criteria
  Do not mark complete until confirmed on:
  - iPhone Safari
  - installed iPhone PWA
  - Android Chrome
  - installed Android PWA
  - 320–360px small mobile width
  - desktop responsive mode
  Confirm:
  - no horizontal page scroll
  - no overlap with notch/home indicator
  - hero is noticeably more compact above the fold
  - CTA stack feels tighter
  - category rail scrolls cleanly
  - floating cart and footer bar no longer clash

## Files Changed


| File                                             | Change                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `index.html`                                     | Add mobile-web-app-capable meta                                                        |
| `src/index.css`                                  | dvh fallback, safe-area utilities, app-container                                       |
| `src/components/customer/HeroSection.tsx`        | Compact hero: smaller logo, clamp headings, horizontal buttons, hide chevron on mobile |
| `src/components/layout/FooterInfoBar.tsx`        | Compress to h-10, smaller text                                                         |
| `src/components/customer/FloatingCartButton.tsx` | Adjust bottom offset for compressed footer                                             |
| `src/components/customer/MenuSection.tsx`        | Fix sticky top to use header-offset, tighten section padding                           |
| `src/pages/Index.tsx`                            | Reduce bottom padding and about section spacing                                        |
