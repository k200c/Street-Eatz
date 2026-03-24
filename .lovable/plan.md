

# Production Fixes: Flatbread Pricing, Deliveroo Removal, Banner Display

## Task 1 — Flatbread Price: €1.00 → €2.00

**Root cause**: `BREAD_SWAP_FLATBREAD.price` is hardcoded as `1.00` in two files.

**Files**:
- `src/components/customer/ProductSheet.tsx` line 73: change `price: 1.00` → `price: 2.00`
- `src/components/staff/StaffProductSheet.tsx` line 68: change `price: 1.00` → `price: 2.00`

Also update the display text on line 646 of ProductSheet (`+€1.00` → `+€2.00`) and the equivalent in StaffProductSheet.

No cart/payload/pricing logic changes needed — the price flows through `BREAD_SWAP_FLATBREAD.price` into `price_adjustment` automatically.

---

## Task 2 — Remove Deliveroo

**File**: `src/components/customer/DeliveryOptionsModal.tsx`

- Remove the `DELIVEROO_URL` constant
- Remove the Deliveroo `<a>` button (lines 35-44)
- Update the dialog description from "Choose your preferred delivery partner" to "Order via Just Eat for delivery"
- Since there's now only one option, simplify the modal accordingly

---

## Task 3 — Marketing Banner Not Showing on Homepage/Menu

**Root cause**: The homepage (`Index.tsx`) and menu page (`Menu.tsx`) do NOT use `CustomerLayout`, which is the only component that renders `<MarketingBanner />`. They use their own layout with `<Navbar />` directly.

The database already has the banner enabled with text: *"This App is for collection only! Press Delivery button to access Just Eat"*

**Fix**: Add `<MarketingBanner />` to both `Index.tsx` and `Menu.tsx`, positioned at the very top (before `<Navbar />`). This is the minimal fix — no need to refactor these pages to use `CustomerLayout`.

---

## Task 4 — Collection Only Notice

**Already handled**: The marketing banner text in the database is already set to the collection-only message. Once Task 3 is fixed, this displays automatically on all pages.

No additional banner component needed.

---

## Task 5 — Banner System

The current `MarketingBanner` component already supports:
- Toggle via `marketing_banner_enabled` in app_settings
- Custom text via `marketing_banner_text`
- Dismissible per session
- Realtime updates

This single banner serves both marketing and operational notices. No structural changes needed.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/customer/ProductSheet.tsx` | `price: 1.00` → `2.00`, display `+€1.00` → `+€2.00` |
| `src/components/staff/StaffProductSheet.tsx` | Same flatbread price fix |
| `src/components/customer/DeliveryOptionsModal.tsx` | Remove Deliveroo button and URL |
| `src/pages/Index.tsx` | Add `<MarketingBanner />` before `<Navbar />` |
| `src/pages/Menu.tsx` | Add `<MarketingBanner />` before `<Navbar />` |

**No changes to**: cart logic, pricing rules, order payload, checkout, edge functions, receipt builder, n8n, database schema.

