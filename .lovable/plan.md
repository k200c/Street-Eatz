

# Implementation Plan: Menu, Pricing, UX & SEO Updates

## Summary

8 files modified, 1 new file created. Covers: Extra Jerk Chicken rename, sauce pricing refactor, loaded fries category pricing centralization, beef patty hidden for Flatbreads, fries size toggle UX, brand spelling fixes, SEO H1 + local content, and voice alias updates.

---

## Fries Size Pairing Strategy

DB fries products:
- `Handcut Chips` (€3.50) — no large variant, no toggle
- `Small Truffle Parmesan Fries` (€6.00) ↔ `Large Truffle Parmesan Fries` (€9.00) — clear pair
- `Truffle Parmesan Fries` (€6.00) — treat as alias for Small Truffle
- `Small Sloppy Fries` (€6.50) ↔ `Sloppy Jose Fries` (€11.50) — pair (Large variant has different name)
- `Pulled Beef Chilli Loaded Fries` (€11.00) — no pair, no toggle
- `Kids chip` (€2.00) — no pair

**Strategy**: Use an explicit variant map in a new shared utility. This is the safest approach given irregular naming. The map uses product IDs for reliability. Products without a pair never show the toggle.

---

## File-by-File Changes

### 1. NEW: `src/lib/productVariants.ts`

Fries size variant pairing utility.

```typescript
// Explicit fries variant pairing map using product IDs
// Only products with a valid small/large pair get the size toggle
const FRIES_VARIANT_PAIRS: Array<{ smallId: string; largeId: string; baseName: string }> = [
  {
    smallId: 'fc7e55cf-e01d-4c3f-a51d-2a09024774d8', // Small Truffle Parmesan Fries
    largeId: 'db58a98d-e755-4f42-8606-62c282881d22', // Large Truffle Parmesan Fries
    baseName: 'Truffle Parmesan Fries',
  },
  {
    smallId: '50ba3f2f-b10f-4338-83df-25e726d1f771', // Small Sloppy Fries
    largeId: 'd4c8f458-23f1-4f40-865a-12d5687ffa18', // Sloppy Jose Fries (Large)
    baseName: 'Sloppy Fries',
  },
];

// Also map the "Truffle Parmesan Fries" (no size prefix) as an alias for the small
const ALIAS_TO_SMALL: Record<string, string> = {
  'd81357ed-6ef5-42fe-9e77-4161406758c4': 'fc7e55cf-e01d-4c3f-a51d-2a09024774d8',
};

export interface FriesVariantPair {
  smallId: string;
  largeId: string;
  baseName: string;
}

export function getFriesVariantPair(productId: string): FriesVariantPair | null {
  const resolvedId = ALIAS_TO_SMALL[productId] || productId;
  return FRIES_VARIANT_PAIRS.find(p => p.smallId === resolvedId || p.largeId === resolvedId) || null;
}

export function isSmallVariant(productId: string): boolean {
  const resolvedId = ALIAS_TO_SMALL[productId] || productId;
  return FRIES_VARIANT_PAIRS.some(p => p.smallId === resolvedId);
}

export function isFriesProduct(product: { category: string }): boolean {
  return product.category === 'Fries';
}
```

### 2. MODIFY: `src/lib/pricingRules.ts`

Add `getSaucePrice()`, `getLoadedFriesPrice()`, and centralized constants.

**Changes:**
- Add `LOADED_FRIES_STANDARD_PRICE = 6.50`, `LOADED_FRIES_SPECIALS_PRICE = 3.50`
- Add `getLoadedFriesPrice(category: string): number`
- Add `getSaucePrice(sauceName: string, productCategory: string): number` — Kids free, Ketchup/Mayo €0.50, others €1.50
- Update `sauceKeywords` and `saucePrice` in EXTRA_PRICING to reflect €1.50 for standard sauces (this only affects ingredient extras, not the dropdown)

### 3. MODIFY: `src/components/customer/ProductSheet.tsx`

Multiple changes:
1. **Rename**: Line 59 `'Extra Chicken'` → `'Extra Jerk Chicken'`
2. **Remove local loaded fries constants** (lines 49-54): Import `getLoadedFriesPrice` from pricingRules
3. **Hide beef patty for Flatbreads**: Line 206 add `&& product.category !== 'Flatbreads'`
4. **Sauce pricing**: Import `getSaucePrice`, use it for sauce dropdown labels (`getSaucePrice(sauce.name, product.category)` instead of `sauce.price`), sauce total calc (line 342), and `buildAllModifiers` sauce section (line 316)
5. **Fries size toggle**: 
   - Import `getFriesVariantPair`, `isSmallVariant` from productVariants
   - Add `useProductsByCategory('Fries')` query to get all fries products for variant lookup
   - Add state: `selectedSize` ('small' | 'large'), default based on which variant was clicked
   - Add `activeProduct` derived state: if fries with a pair, swap to the variant matching `selectedSize`
   - Render a Small/Large tab toggle at top of sheet when pair exists
   - Use `activeProduct` instead of `product` for price display, name, and `handleAddToOrder`
   - Total calc uses `activeProduct.price` instead of `product.price`

### 4. MODIFY: `src/components/staff/StaffProductSheet.tsx`

Mirror all customer ProductSheet changes:
1. **Rename**: Line 49 `'Extra Chicken'` → `'Extra Jerk Chicken'`
2. **Remove `LOADED_FRIES_SMALL_PRICE`** (line 44): Import `getLoadedFriesPrice`
3. **Use `getLoadedFriesPrice(product.category)`** in all 4 locations: buildAllModifiers (line 274), calcPrice (line 319), dropdown labels (lines 476-489)
4. **Hide beef patty for Flatbreads**: Line 191 add `&& product.category !== 'Flatbreads'`
5. **Sauce pricing**: Import and use `getSaucePrice` for dropdown labels and total calc (line 321), and buildAllModifiers (line 296)
6. **Fries size toggle**: Same approach as customer — add variant pair detection, size state, product swap, and tab toggle UI

### 5. MODIFY: `supabase/functions/create-voice-order/index.ts`

Add voice aliases to `ALIAS_MAP`:
```
"jerk chicken": "extra jerk chicken",
"extra chicken": "extra jerk chicken",
"extra jerk chicken": "extra jerk chicken",
"small fries": "small truffle parmesan fries",
"large fries": "large truffle parmesan fries",
"small sloppy fries": "small sloppy fries",
"large sloppy fries": "sloppy jose fries",
"sloppy fries": "small sloppy fries",
"truffle fries": "small truffle parmesan fries",
"large truffle fries": "large truffle parmesan fries",
```

### 6. MODIFY: `src/components/customer/HeroSection.tsx`

- Change H1 content from `GOURMET` to `StreetEatz Waterford` (lines 69-83)
- Change H2 from `STREET FOOD` to `GOURMET STREET FOOD` (line 85-96)
- Fix logo alt text: `"Street Eatz Logo"` → `"StreetEatz Logo"` (line 63)

The visual styling is preserved (same font sizes, colors, animations). The H1 now contains the required keywords for SEO.

### 7. MODIFY: `src/components/customer/HeroCarousel.tsx`

- Line 50: `alt="Street Eats"` → `alt="StreetEatz"`
- Line 59: `<h2>Street Eats</h2>` → `<h2>StreetEatz</h2>`

### 8. MODIFY: `src/pages/Index.tsx`

Replace `AboutSection` with structured SEO content:

```tsx
function AboutSection() {
  return (
    <section id="about" className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-heading text-3xl md:text-4xl text-foreground mb-6 text-center">
          ABOUT STREETEATZ
        </h2>
        <p className="text-muted-foreground text-lg leading-relaxed text-center mb-10">
          Welcome to StreetEatz. Born in Waterford, we believe in bold flavors,
          fresh ingredients, and the perfect smash burger. Whether you're grabbing
          a quick lunch or a late-night feast, we bring the gourmet street food
          experience straight to your hands.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          <div>
            <h3 className="font-heading text-xl text-primary mb-2">Smash Burgers</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Our signature smash burgers are hand-pressed on the griddle and
              loaded with fresh toppings. The best burgers in Waterford, made
              the way street food should be.
            </p>
          </div>
          <div>
            <h3 className="font-heading text-xl text-primary mb-2">Gourmet Flatbreads</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Freshly grilled flatbreads packed with bold fillings and house sauces.
              A Waterford food truck favourite you won't find anywhere else.
            </p>
          </div>
          <div>
            <h3 className="font-heading text-xl text-primary mb-2">Loaded Fries</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Handcut chips and loaded fries piled high with toppings. From truffle
              parmesan to sloppy fries — the best loaded fries in Waterford.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="street-card p-4 text-center">
            <p className="font-heading text-primary mb-1">THU - FRI</p>
            <p className="text-foreground">12pm - 7pm</p>
          </div>
          <div className="street-card p-4 text-center">
            <p className="font-heading text-primary mb-1">SAT - SUN</p>
            <p className="text-foreground">1pm - 7pm</p>
          </div>
        </div>
      </div>
    </section>
  );
}
```

### 9. MODIFY: `src/pages/NotFound.tsx`

Brand the 404 page with StreetEatz.

### 10. MODIFY: `index.html`

- `<title>` → `StreetEatz | Gourmet Street Food Waterford`
- `<meta name="description">` → include "StreetEatz Waterford"
- OG title/description → use StreetEatz (with Z)
- Add `<meta name="twitter:title">` and `<meta name="twitter:description">`
- Fix `og:site_name` → `StreetEatz`

---

## Fries Size Toggle — UI Detail

When a user taps a fries product that has a variant pair (e.g., Small Truffle Parmesan Fries):

```
┌─────────────────────────────┐
│  [  Small  ] [  Large  ]    │  ← toggle tabs
│                             │
│  Small Truffle Parmesan     │
│  Fries             €6.00   │
│                             │
│  (rest of sheet...)         │
└─────────────────────────────┘
```

Tapping "Large" swaps the underlying product to Large Truffle Parmesan Fries (€9.00), updates the name, price badge, and total. All customizations (sauces, extras) are preserved since they're independent of the product variant.

Products without a pair (Handcut Chips, Pulled Beef Chilli Loaded Fries, Kids chip) show no toggle — sheet opens normally.

---

## Sauce Pricing Logic (centralized in pricingRules.ts)

```typescript
export function getSaucePrice(sauceName: string, productCategory: string): number {
  if (productCategory === 'Kids Menu') return 0;
  const lower = sauceName.toLowerCase();
  if (lower.includes('ketchup') || lower.includes('mayo')) return 0.50;
  return 1.50;
}
```

Used in both ProductSheet components for:
- Dropdown label display: `{sauce.name} (+€{getSaucePrice(sauce.name, product.category).toFixed(2)})`
- Total calculation: replaces `saucesProducts?.find(...)?.price`
- `buildAllModifiers`: `price_adjustment: getSaucePrice(sauce.name, product.category)`

---

## Loaded Fries Pricing (centralized in pricingRules.ts)

```typescript
export const LOADED_FRIES_STANDARD_PRICE = 6.50;
export const LOADED_FRIES_SPECIALS_PRICE = 3.50;

export function getLoadedFriesPrice(category: string): number {
  return category === 'Specials' ? LOADED_FRIES_SPECIALS_PRICE : LOADED_FRIES_STANDARD_PRICE;
}
```

Customer ProductSheet already has this locally — it gets moved to pricingRules and imported. Staff ProductSheet currently uses a flat `6.50` everywhere — gets updated to use `getLoadedFriesPrice(product.category)`.

---

## Verification Checklist

| # | Check | Details |
|---|-------|---------|
| 1 | Extra Jerk Chicken rename | Both ProductSheet + StaffProductSheet show "Extra Jerk Chicken", id stays `'extra-chicken'` |
| 2 | Sauce pricing: Ketchup/Mayo €0.50 | Dropdown shows +€0.50 for these |
| 3 | Sauce pricing: Others €1.50 | All non-ketchup/mayo sauces show +€1.50 |
| 4 | Sauce pricing: Kids free | Kids Menu products show all sauces as +€0.00 / FREE |
| 5 | Loaded fries: Specials €3.50 | Specials category shows loaded fries at €3.50 in dropdown |
| 6 | Loaded fries: Others €6.50 | Non-Specials show €6.50 |
| 7 | No beef patty for Flatbreads | Beef Patty stepper hidden when product.category === 'Flatbreads' |
| 8 | Fries size toggle appears | Truffle Parmesan Fries and Sloppy Fries show Small/Large tabs |
| 9 | Fries toggle swaps product | Toggling Large updates name, price, total |
| 10 | Fries toggle: no toggle for Handcut Chips | Regular chips open normally |
| 11 | Fries toggle in Staff POS | Same behavior mirrored |
| 12 | Brand: StreetEatz everywhere | Index about section, HeroSection H1, HeroCarousel, NotFound, index.html meta tags |
| 13 | SEO: H1 contains "StreetEatz Waterford" | Single H1 on homepage with correct keywords |
| 14 | SEO: H2/H3 structure | Menu section uses H2, about uses H2 + H3s for food types |
| 15 | Voice aliases updated | "extra jerk chicken", "large fries", "small fries" etc. resolve correctly |
| 16 | Cart integrity | Totals correct after all pricing changes |
| 17 | No console errors | Clean render |
| 18 | Backwards compatibility | Old orders with "Extra Chicken" or price_adjustment: 0 render fine |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Fries variant IDs are hardcoded | Using DB product IDs is reliable; if products are deleted/recreated, the map needs updating. A fallback name-based matcher could be added later. |
| `Truffle Parmesan Fries` (€6.00) is a duplicate of `Small Truffle Parmesan Fries` | Map it as an alias to the small variant via `ALIAS_TO_SMALL` |
| Sauce dropdown shows getSaucePrice instead of DB price | This is intentional — centralized pricing overrides DB price for consistency |
| Staff POS loaded fries was always €6.50 for Specials | Fixed by using `getLoadedFriesPrice(product.category)` |

