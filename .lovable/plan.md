
Goal: Fix the remaining mobile hero visibility issue without undoing the compact menu improvements or touching nav structure.

1) Root cause (from current code + screenshot)
- `HeroSection` is still constrained on mobile (`min-h-[25vh]`) while using centered vertical composition under a fixed navbar.
- The navbar overlays top content (expected with fixed nav), but the hero does not explicitly reserve that top offset, so the logo sits too high and appears cropped.
- Section-level `overflow-hidden` plus a negative glow inset makes top-edge clipping more noticeable.

2) Exact file to edit
- `src/components/customer/HeroSection.tsx`

3) Exact code changes to apply
- Keep nav/header unchanged.
- Update hero mobile composition so it starts below the visible header:
  - Replace mobile centering with top-aligned layout:
    - `justify-center` → `justify-start sm:justify-center`
  - Reserve real top space using header offset:
    - add mobile top padding using `var(--header-offset)` (e.g. `pt-[calc(var(--header-offset)+0.5rem)] sm:pt-16`)
  - Use a measured hero height increase (not oversized):
    - `min-h-[25vh]` → `min-h-[26vh]` (or `24vh` if visual test shows enough)
  - Keep compact bottom spacing:
    - `pb-3` (or `pb-4` if needed)
- Prevent logo clipping without making entire section bleed:
  - Keep section clipping controlled (`overflow-x-hidden`)
  - Allow logo container to render glow/logo edges (`overflow-visible` on logo wrapper stays)
  - Slightly reduce glow inset intensity (e.g. `-inset-y-4` → `-inset-y-2`) so glow doesn’t push into clipped regions
- Improve logo readability so it looks “full” on small screens:
  - mobile logo width `w-16` → `w-20`
  - keep existing larger breakpoints unchanged

4) Why this restores full hero visibility (without making hero too tall)
- The hero now explicitly accounts for fixed header height on mobile, so logo/title no longer start under the nav.
- Measured min-height adjustment (+1–2vh) preserves compactness while giving enough breathing room.
- Clipping is fixed locally at the logo/glow level, avoiding global overflow side effects.

5) Why this stays consistent across Safari + installed PWA
- `var(--header-offset)` already includes safe-area + nav height, so both browser mode and standalone mode get correct top spacing automatically.
- No nav redesign, no global shell churn, no menu-density rollback—only hero composition is corrected.

6) Validation checklist after implementation
- iPhone Safari: full logo visible at first paint; no top crop.
- Installed PWA: same hero composition and spacing under header.
- CTA row still visible without pushing menu too far down.
- Category rail/menu density remains as improved in prior pass.
