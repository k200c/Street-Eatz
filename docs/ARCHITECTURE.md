# Architecture — how Street Eatz actually fits together

As found by reading the source across August–September 2026, not as designed. Where the repo cannot see something, it says so.

## The shape

```
Customer phone ──▶ React SPA (Vite, Netlify) ──▶ Supabase (Postgres + Auth + Edge Functions)
                        │                                   ▲
                        │ card checkout                     │ confirm-payment (secret)
                        ▼                                   │
                   n8n cloud ──▶ Viva / myPOS ──────────────┘
                     │  ├──▶ PrintNode (kitchen ticket)
                     │  └──▶ Twilio (order SMS, review request, broadcasts)
Phone call ──▶ Vapi ─┘  (VoiceBot workflow → create-voice-order)

Staff tablet ──▶ same SPA at /admin (KDS, POS, Command Center)
Owner ──▶ Command Center → Netlify function (management assistant → OpenAI)
Crawlers ──▶ prerendered HTML in dist/<route>/index.html (built from live menu)
```

Three runtimes hold logic: **the browser**, **Supabase** (SQL functions, views, edge functions) and **n8n**. The repo contains the first two. n8n's three workflows — VoiceBot, Order Ingestion, Payment Processor — are outside it and must be treated as UNKNOWN unless read directly.

## Source-of-truth rules (the ones that matter)

1. **Money.** `orders.payment_status` is written authoritatively by `confirm-payment`, called by n8n after the provider confirms. Staff POS also writes `paid` directly from the browser — a known duplication. `isOrderPaid()` accepts both `paid` and `completed`; every analytics view derives from `v_paid_orders`, which uses the same rule.
2. **Open or closed.** `get_store_status()` only. It resolves the manual toggle, today's hours and the wait time in Europe/Dublin. Nothing in the browser recomputes from `is_store_open` or `opening_hours`. A wait time is null unless open, and the normaliser drops one even if sent.
3. **Metrics.** Views, never client-side arithmetic. `src/lib/insights.ts` only weights or turns a row into a verdict, and is unit tested. `broadcasts.revenue_generated` is unreachable by construction.
4. **Business identity.** `business_profile` (one row) and `app_settings` (`id = 1`) in the database; `src/config/client.ts` in the frontend. Extraction means making the frontend read the rows — see `EXTRACTION-AUDIT.md`.
5. **Menu.** `products`, `modifiers`, `ingredients`, `product_allergens`. Prices are re-resolved from the DB in `create-voice-order`; the web checkout still trusts the browser's price (known, on the ordering path, not touched overnight).

## Frontend

- **Routing** in `src/App.tsx`. Public: `/`, `/menu`, the prerendered content routes, `/rate/:token`, legal pages. Auth-gated: `/cart`, `/profile`. Admin: `/admin*`.
- **Data** via TanStack Query hooks in `src/hooks/`. Two Supabase clients: `supabase` (session) and `publicSupabase` (anon, no session lock) for logged-out reads.
- **Module visibility and order**: `foodos_module_settings` (`enabled`, `display_order`, `default_expanded`) through `useModuleLayout`. Session overrides in `sessionStorage`; never written back.
- **Admin surfaces**: `StaffDashboard` (KDS + POS), `CommandCenter` (tabs: assistant, operations, customers, marketing, analytics, social, settings).
- **Analytics**: `AnalyticsDashboard` → `InsightSections` → one `InsightPanel` per verified view, each with loading / error / empty / populated states and an "as of" stamp.

## Build pipeline

`npm run build` = `validate-environment` (gate; fails without Supabase env) → `generate-seo` (sitemap, robots, llms.txt into `public/`) → `vite build` → `create-spa-fallback` (`404.html`) → `prerender` (writes `dist/<route>/index.html` with real dish text, JSON-LD and og:image from the live menu). SEO generation never fails the build; it warns.

Netlify serves a matching static file before the SPA catch-all, so crawlers get content and `createRoot` replaces it for people.

## Database layer (as of 31 Aug snapshot)

~38 tables, ~55 views, ~25 RPCs, and `qa_checks()` — a 26-check self-testing suite (`status` is `PASS` / `FAIL` / `INFO`). All analytics views are `security_invoker`; admin sees all, a customer sees their own rows. `feedback_tokens` and the enquiry table have RLS on with no policies — reachable only via service-role RPCs. Migration history diverged from production; `supabase/schema-snapshot-2026-08-31.sql` is the reference.

## Deployment topology (the part that keeps biting)

- **Frontend**: Netlify, from `main`. `main` is 5 commits behind `checkpoint/foodos-2026-08-31`; everything since sits on `feature/production-readiness`. Merging ships ~207 files at once.
- **Edge functions**: pushing source does **not** deploy. `supabase functions deploy <name> --project-ref svbilfaanpiyieyxbsss`. `config.toml` now names the right project; the explicit ref is still the habit.
- **Database**: the production frontend and this branch read the same project, so a migration is live the moment it is applied even if the branch is not.
- **n8n, Vapi, PrintNode, Twilio, Viva**: dashboards. Not in the repo.

## Known structural debts

Single-tenant everywhere (no `tenant_id`); `app_settings` is a singleton; `customers` is keyed by phone. Six `payment_status` vocabularies with three comparison rules in the UI. Seven copies of `+353` phone normalisation. A generated `types.ts` that predates most of the views (hence the `as never` casts). All catalogued in `EXTRACTION-AUDIT.md` and the August system inventory.
