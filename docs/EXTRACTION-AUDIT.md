# Extraction audit — every client-specific value in the codebase

**Purpose.** Street Eatz is the reference implementation that Food OS is lifted from. This is the register of everything that must move into `client_config` before the codebase can be pointed at a second hospitality client. It is a register, not a refactor: nothing here was changed tonight.

**Method.** Repo-wide grep on 2 September 2026 for brand strings, place names, phone numbers, emails, URLs, project refs, hours, colours, category enums, add-on names and threshold numbers, then each hit read in context. Line numbers are as found; they will drift with edits and the value is the durable identifier.

**Status legend.** `config` = already centralised in `src/config/client.ts` (extract that file wholesale); `hard` = still hardcoded at the call site; `db` = lives in a migration or seed row; `build` = baked in at build time by a script.

**Verdict up front.** `src/config/client.ts` already holds the identity core (name, address, phone, email, socials, hours, map). The hardcoding that remains falls into four groups — duplicate hours copy, the menu domain model, brand colour, and generated build assets — plus three values in the database itself. Extraction is a config schema plus roughly forty call-site edits, not a rewrite.

---

## 1. Business identity (NAP, brand)

| File:line | Value | `client_config` key | Status |
|---|---|---|---|
| `src/config/client.ts:4` | `brandName: 'Street Eatz'` | `brand.name` | config |
| `src/config/client.ts:5` | `wordmark: 'StreetEatz'` | `brand.wordmark` | config |
| `src/config/client.ts:6` | `legalName: 'Street Eatz Waterford'` | `brand.legal_name` | config |
| `src/config/client.ts:7` | `city: 'Waterford'` | `location.locality` | config |
| `src/config/client.ts:8` | `category: 'Gourmet Street Food'` | `brand.category` | config |
| `src/config/client.ts:9` | `tagline: 'Fresh · Bold · Waterford'` | `brand.tagline` | config |
| `src/config/client.ts:10` | `streeteatzwaterford@gmail.com` | `contact.email` | config |
| `src/config/client.ts:11-12` | `086 361 9157` / `tel:+353863619157` | `contact.phone_display`, `contact.phone_e164` | config |
| `src/config/client.ts:13-18` | Crystal Sports and Leisure Centre, Cork Rd, Ballynaneashagh, Waterford, X91 E6PX | `location.venue`, `location.address_lines[]`, `location.eircode` | config |
| `src/config/client.ts:20-23` | Instagram, Facebook, Google Maps embed URLs | `social.instagram`, `social.facebook`, `location.map_embed_url` | config |
| `src/config/client.ts:1`, `src/assets/street-eatz-logo-new.jpeg` | logo asset | `brand.logo_url` (storage, not a bundled import) | hard |
| `index.html:6-9, 25, 27, 40-51` | title, description, author, app name, OG/Twitter titles naming Street Eatz Waterford and Cork Road | `seo.default_title`, `seo.default_description`, `brand.name` | hard |
| `index.html:57-58` | `og:image` fallback `app-icon-1024-v2.png` | `brand.share_image_url` | hard |
| `public/manifest.webmanifest:3-5` | `"Street Eatz Admin"`, `"Street Eatz"` | `brand.name`, `pwa.short_name` | hard |
| `src/index.css:72` | Street Eatz comment in theme block | — (comment) | hard |
| `src/components/staff/MarketingHub.tsx:227, 639` | "Street Eatz" in placeholder copy | `brand.name` | hard |
| `src/pages/OrderSuccess.tsx` | "Crystal Sports Centre" in confirmation copy | `location.venue_short` | hard |
| `src/pages/QrHub.tsx` | Waterford in QR poster copy | `location.locality` | hard |
| `src/components/customer/StoreClosedOverlay.tsx:39-40` | venue + hours in closed overlay | `location.venue`, `hours` | hard (component is orphaned — see §8) |
| `src/components/staff/CompetitorIntelligence.tsx:52` | `maps.google.com/…` placeholder | `location.map_url` | hard |

## 2. Opening hours — five copies of one fact

The server is now the only authority for open/closed (`get_store_status()`), but the *display* strings are still duplicated. Every one should read from `client_config.hours` or from `seo_opening_hours_jsonld()`.

| File:line | Value | Key | Status |
|---|---|---|---|
| `src/config/client.ts:25-30` | Thu–Fri 12pm–7pm, Sat–Sun 1pm–7pm | `hours.weekly[]` | config |
| `src/components/layout/SiteFooter.tsx:81-86` | same, hardcoded | `hours.weekly[]` | hard |
| `src/components/layout/FooterInfoBar.tsx:23` | `Thu-Fri: 12-7pm · Sat-Sun: 1-7pm` | `hours.summary` | hard |
| `src/pages/Index.tsx:50-56` | same, hardcoded in About section | `hours.weekly[]` | hard |
| `src/pages/DeliveryPolicy.tsx:33-34` | same, in legal prose | `hours.weekly[]` | hard |
| `src/components/customer/StoreClosedOverlay.tsx:40` | `Thu–Fri 12pm–7pm` | `hours.summary` | hard |
| `public.app_settings.preorder_hours` (db) | pre-order windows | `hours.preorder` | db |

## 3. Menu domain model — the deepest coupling

These are not brand strings; they are Street Eatz's *menu* baked into the product logic. A café with no "Kids Menu" or no dry-aged patties hits every one of these.

| File:line | Value | Key | Status |
|---|---|---|---|
| DB enum `product_category` (`20251202232123`, extended `20260124`, `20260130`) | Burgers, Flatbreads, Fries, Drinks, Specials, Sauces, Kids Menu | replace enum with `categories` table keyed to client | db |
| `src/types/database.ts:1` | same union type | generated from `categories` | hard |
| `src/components/customer/MenuSection.tsx:15` | category tab list | `menu.categories[]` | hard |
| `src/components/customer/CategoryNav.tsx:7-8` | category → icon map | `menu.categories[].icon` | hard (orphaned component) |
| `src/components/staff/AddProductDialog.tsx:37, 41, 76` | category list, zod enum, default `'Burgers'` | `menu.categories[]` | hard |
| `supabase/functions/get-menu/index.ts:8-28` | `VALID_CATEGORIES`, `CATEGORY_ALIASES` (chips→Fries, kid→Kids Menu) | `menu.categories[]`, `menu.category_aliases` | hard |
| `src/components/customer/ProductSheet.tsx:54` | `STANDALONE_ADDONS` — add-ons by **ingredient name** (`dbName`) | `menu.addons[]` from `ingredients` where `is_addable` | hard |
| `src/components/customer/ProductSheet.tsx:63` | `BEEF_PATTY = { dbName: 'Dry-aged beef patties', maxQty … }` | `menu.stepper_addon` | hard |
| `src/components/customer/ProductSheet.tsx:70` | `BREAD_SWAP_FLATBREAD` with a fixed price | `menu.bread_swap` (modifier group) | hard |
| `src/components/customer/ProductSheet.tsx:202-215` | `'Kids Menu'`, `'Burgers'`, `'Specials'`, `'Flatbreads'` category logic | category **flags** (`allows_bread_swap`, `is_kids`) not name checks | hard |
| `src/lib/pricingRules.ts:16-18` | €0.50 add-on fallback; kids pricing branch on `'Kids Menu'` | `menu.addon_fallback_price`, category flag | hard |
| `src/lib/pricingRules.ts:41-42` | `LOADED_FRIES_STANDARD_PRICE = 6.50`, `SPECIALS 3.50` | `menu.loaded_fries_prices` — or a modifier group | hard |
| `src/components/customer/ProductCardHorizontal.tsx:22`, `ProductSheet.tsx:33` | `'Kids Menu': heroBurger` fallback image map | `menu.categories[].fallback_image` | hard |
| `src/pages/StaffPOS.tsx` (orphaned) | combo bundles by product name | delete | hard |
| `src/content/seo-pages.json` | six pages of Street Eatz prose naming dishes, Cork Road, dry-aged beef | per-client content file — this is the one file expected to be rewritten per client | by design |

## 4. Loyalty and CRM thresholds

| File:line | Value | Key | Status |
|---|---|---|---|
| `src/hooks/useCRMData.ts:29-32` | tier thresholds €50 / €150 / €300, Bronze→Platinum | `crm.tiers[]` | hard |
| `src/hooks/useCRMData.ts` | 30-day "lapsed", VIP by spend | `crm.lapsed_days`, `crm.vip_rule` | hard |
| `src/pages/Profile.tsx:141-142` | fallback `loyalty_reward_cost ?? 5`, `'Free Fries or a Drink'` | `app_settings.loyalty_*` (already db; fallbacks should not exist) | hard |
| `public.app_settings.loyalty_*` (db) | 7 points, reward label | `loyalty.points_per_reward`, `loyalty.reward_label` | db |
| `src/components/customer/LoyaltyGuestPrompt.tsx` | fallback `7`, `'a free drink or fries'` | same — fallbacks only | hard |

## 5. Integrations and infrastructure

| File:line | Value | Key | Status |
|---|---|---|---|
| `supabase/config.toml:1` | `project_id = "svbilfaanpiyieyxbsss"` | per-deploy env | build |
| `index.html:12-13` | `%VITE_SUPABASE_URL%` preconnect | env (already) | ok |
| `index.html:14-15` | `storage.googleapis.com` preconnect — product images live on a Glide bucket | `assets.image_host` | hard |
| `src/components/customer/DeliveryOptionsModal.tsx:9` | Just Eat menu URL | `delivery.partners[]` | hard |
| `supabase/functions/get-pending-review-orders/index.ts:9` | default review link `g.page/r/streeteatz/review` (placeholder) | `reviews.google_url` — now also in `app_settings.google_review_url` | hard + db |
| `src/lib/googleReviewUrl.ts` | review URL handling | reads `app_settings` | ok |
| `supabase/functions/post-now/index.ts:121-124` | `location_name: "Street Eatz Waterford"`, `brand: "Street Eatz"` | `brand.name`, `location.display` | hard |
| `supabase/functions/*` (7 files) | `+353` phone normalisation, `00353` handling | `contact.country_code` — one shared helper | hard, duplicated ×7 |
| `netlify/functions/management-assistant.ts` | system prompt naming Street Eatz, Danny, Waterford (verify) | `assistant.persona` | hard |
| n8n (outside repo) | printer `74663174`, Twilio sender, three workflow IDs, webhook paths `street-eatz-*` | `integrations.printnode.printer_id`, `integrations.twilio.sender_id`, `integrations.n8n.*` | outside repo |
| `integrations/voice/contracts/vapi-tools.v1.json` | Vapi tool contract naming Street Eatz | `voice.assistant_id`, prompt template | hard |
| `scripts/architecture-audit.mjs:89` | regex `Street Eatz\|streeteatz\|ftzinsesuiuqcjfpbaur\|74663174` | audit tooling — update when config lands | tooling |

## 6. Build-time generated assets (scripts I wrote this week — flagged honestly)

| File:line | Value | Key | Status |
|---|---|---|---|
| `scripts/lib/seo-env.mjs:47` | `siteUrl` default `https://streeteatzwaterford.ie` | `site.canonical_url` (env `VITE_SITE_URL` already overrides) | build |
| `scripts/generate-seo.mjs:84` | robots.txt header comment naming the business | `brand.name` | build |
| `scripts/generate-seo.mjs:132, 146-153` | llms.txt prose: Cork Road, Waterford, "not Wisconsin", dry-aged, hand-cut | `seo.llms_summary` (per-client prose block) | build |
| `scripts/prerender.mjs:156, 290-291` | home-page prerender copy naming Street Eatz and Cork Road | `seo.home_summary` | build |
| `scripts/prerender.mjs` (`PRERENDER_STYLE`) | `#FF6B00`, `#262626`, Montserrat/Inter | `brand.colors`, `brand.fonts` | build |

## 7. Brand colour and type

| File:line | Value | Key | Status |
|---|---|---|---|
| `src/index.css` (`:root`) | `--primary: 25 100% 50%` (street orange), `#0A0A0A`, `#262626` | `brand.colors.primary`, `.bg`, `.card` — CSS variables injected at build | hard |
| `index.html:17-19, 58-76` | `#0A0A0A` theme colour, `#F97316` spinner | `brand.colors` | hard |
| `src/components/staff/AnalyticsDashboard.tsx` (×4), `InsightSections.tsx` | `hsl(25 …)` heat scale | derive from `--primary` | hard |
| `src/pages/PaymentSuccess.tsx`, `Processing.tsx`, `OrderSuccess.tsx` | confetti colours `#FF6B35` etc | `brand.colors.celebration[]` | hard |
| `src/pages/QrHub.tsx`, `ProductSheet.tsx`, `HeroSection.tsx` | `#0A0A0A` inline | `brand.colors.bg` | hard |
| `tailwind.config.ts:17-18` | Montserrat heading, Inter body | `brand.fonts` | hard |

## 8. Database values that are client identity

| Object | Value | Key | Status |
|---|---|---|---|
| `assign_staff_role_on_signup()` (`20260109004927:10`) | grants admin to `streeteatzwaterford@gmail.com` | `admin.bootstrap_email` | db |
| `20260130174022` | admin role for a hardcoded user UUID (`kcodee20@gmail.com`) | remove; use invite flow | db |
| `public.business_profile` (single row) | NAP, socials, URLs — **this is the intended home for §1** | `client_config` should *be* this row | db ✓ |
| `public.app_settings` (`id = 1`) | wait-time options, loyalty, banner, preorder windows | per-client settings row | db ✓ |
| `product_category` enum | see §3 | table | db |

## 9. Dead code carrying client values (delete, don't extract)

`src/components/customer/StoreClosedOverlay.tsx`, `CategoryNav.tsx`, `HeroCarousel.tsx`, `ProductCard.tsx`, `src/pages/StaffPOS.tsx`, `StaffPOSQuick.tsx`, `src/components/staff/QuickPayModal.tsx`, `src/components/checkout/CheckoutModal.tsx`, `src/lib/productVariants.ts` — none has an importer. Each carries hours, category names or bundle definitions that would otherwise show up in this register forever.

---

## Proposed `client_config` shape

```jsonc
{
  "brand":       { "name", "wordmark", "legal_name", "category", "tagline", "logo_url", "share_image_url",
                   "colors": { "primary", "bg", "card", "celebration": [] }, "fonts": { "heading", "body" } },
  "contact":     { "email", "phone_display", "phone_e164", "country_code" },
  "location":    { "venue", "venue_short", "address_lines": [], "locality", "region", "eircode",
                   "lat", "lng", "map_embed_url", "map_url", "display" },
  "hours":       { "weekly": [], "summary", "preorder" },
  "social":      { "instagram", "facebook", "tiktok" },
  "delivery":    { "partners": [] },
  "reviews":     { "google_url" },
  "menu":        { "categories": [{ "key", "label", "icon", "fallback_image", "is_kids", "allows_bread_swap" }],
                   "category_aliases", "addons": [], "stepper_addon", "bread_swap", "addon_fallback_price",
                   "loaded_fries_prices" },
  "loyalty":     { "points_per_reward", "reward_label" },
  "crm":         { "tiers": [], "lapsed_days", "vip_rule" },
  "seo":         { "default_title", "default_description", "home_summary", "llms_summary" },
  "site":        { "canonical_url" },
  "integrations":{ "printnode": { "printer_id" }, "twilio": { "sender_id" }, "n8n": { "base_url", "workflows": {} },
                   "voice": { "assistant_id" } },
  "assistant":   { "persona" },
  "admin":       { "bootstrap_email" }
}
```

`business_profile` and `app_settings` already cover `contact`, `location`, `social`, `reviews`, `hours.preorder` and `loyalty`. The extraction task is to make the frontend read those rows (plus a `menu` model) instead of `src/config/client.ts` and the call sites above — then `client.ts` becomes a build-time cache of the database, not a source.

## Order of work (recommended)

1. **Kill the dead files in §9** — free, and removes a third of the hits.
2. **Hours** — one component reads `client_config.hours`; delete five copies.
3. **Menu categories** → table + flags; retire the enum and the `'Kids Menu'` string checks. This is the only item that touches ordering logic and needs its own careful pass.
4. **Add-ons** → `ingredients.is_addable` drives `STANDALONE_ADDONS`; prices from the row, not constants.
5. **Colours/fonts** → CSS variables from config at build.
6. **Generated assets** → the three scripts read one `seo` block.
7. **Phone normalisation** → one shared helper across the seven edge functions, country code from config.
