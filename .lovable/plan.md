
Goal: make the Staff POS category rail reliably swipeable/scrollable on tablet without changing unrelated POS behavior.

1) Exact component(s) to update
- Primary: `src/components/staff/StaffPOSContent.tsx` (this is the POS/Checkout tab used in `/admin`, and it contains categories including Kids Menu/Sauces).
- No changes to unrelated screens.  
- Optional consistency follow-up (only if used): `src/pages/StaffPOSQuick.tsx` still uses `ScrollArea` for categories and can be aligned later.

2) Root cause found
- The current category row in `StaffPOSContent` uses `overflow-x-auto`, but it is missing the project’s tablet scroll-rail behavior (`category-scroll`), so iPad horizontal gesture handling/momentum is not fully optimized.
- The rail also lacks a strict content-width inner track (`min-w-max/w-max`) and end-padding for the fade overlay, which can make tabs look clipped and the final tab feel partially obscured.
- Discoverability is weak because the right fade is always shown instead of being overflow-aware; this can make the rail feel visually “stuck.”

3) Clean layout/styling fix to apply
- In `StaffPOSContent.tsx`, refactor only the category rail block:
  - Scroller wrapper:
    - `w-full min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar category-scroll`
    - keep single-line rail behavior (`whitespace-nowrap` via pills + non-wrapping flex row)
  - Inner rail:
    - `flex w-max min-w-max gap-2 px-2 pr-10` (extra right padding so last tab is fully visible past fade)
  - Tab buttons:
    - keep existing active-state visuals
    - enforce non-shrinking tappable pills with `flex-none`/`shrink-0` + `whitespace-nowrap`
- Add small scroll-state logic (same pattern as customer menu rail):
  - `categoryScrollRef`
  - `showLeftGradient` / `showRightGradient`
  - `onScroll` + resize check to toggle gradient visibility only when overflow exists
- Keep gradient overlays `pointer-events-none` so swipe/touch never gets blocked.
- Add active-tab centering on select:
  - when a category is tapped, call `scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })` for that tab.
  - This improves tablet speed-of-use with no layout redesign.

4) Parent layout checks (no structural redesign)
- Keep existing `StaffPOSContent` shell (`h-full flex overflow-hidden`) and left panel `min-w-0`.
- Ensure no new `overflow-hidden` is added to the nav rail wrapper itself.
- Preserve current cart panel widths and product grid layout (no regressions to desktop/mobile).

5) Validation plan (tablet-first)
- In `/admin` → POS/Checkout:
  - swipe left/right across category rail on tablet viewport; confirm natural horizontal movement and momentum.
  - verify first and last categories are fully reachable and readable (no hard clipping).
  - confirm active category highlight remains unchanged.
  - confirm rail still works with mouse/trackpad horizontally on desktop.
- Regression checks:
  - category switching still filters products correctly.
  - product grid/cart/checkout interactions unchanged.
  - no visual overlap/jitter introduced.

Expected outcome
- Category rail behaves like a production POS tab strip: smooth horizontal swipe, full category access, no stuck/clipped tabs, and preserved Street Eatz visual style.
