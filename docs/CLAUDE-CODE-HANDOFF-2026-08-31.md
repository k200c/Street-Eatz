# Street Eatz FoodOS — Claude Code engineering handoff

**Handoff date:** 31 August 2026  
**Production domain:** <https://streeteatzwaterford.ie>  
**Netlify site:** `23d50ce7-cc32-4537-8b88-4721fad3c361` (`rad-sprinkles-cb147b`)  
**Current production deploy:** `6a94c6559a910402f8c383d0` — ready/published  
**Supabase project:** `svbilfaanpiyieyxbsss` (`StreetEatz`, EU West)  

## 1. Purpose of this handoff

Claude Code is the primary implementation engineer from this point. Codex should be used as the independent QA, security, data-integrity, release and production-verification engineer.

The goal is not a one-off restaurant dashboard. The target is a reusable, multi-client FoodOS SaaS platform with Street Eatz as the first production tenant. Client branding, module visibility and provider connections must be configuration, not copied code or hard-coded forks.

## 2. Non-negotiable workspace warning

The current worktree is intentionally dirty and contains substantial completed work:

- 95 tracked files changed.
- More than 9,500 inserted lines in the tracked diff, plus many new files.
- New Supabase migrations, Edge Functions, Netlify function, tests, PWA assets and an iOS project are untracked.
- Latest repository commit is `c86d586`, but production contains work newer than that commit.

**Do not run** `git reset --hard`, `git checkout -- .`, broad restore commands, mass formatting, or a generated-code overwrite without first proving it preserves the current work. Do not assume untracked files are disposable.

Claude's first engineering action should be:

1. Read this file and the FoodOS reference documents.
2. Inspect `git status`, `git diff --stat` and the new migrations.
3. Create a safe checkpoint of the current state using the team's agreed branch/commit process.
4. Keep migrations immutable after they have been applied to production; corrections require a new migration.

## 3. Source-of-truth hierarchy

Use this order when records disagree:

1. Paid/settled order evidence and provider callbacks.
2. Canonical Supabase records and immutable ledgers.
3. Verified aggregation views/RPCs.
4. UI-derived values.
5. Never use demo or invented numbers in production reporting.

Relevant reference files outside the repo are in `C:\Users\Kyle\Desktop\KCAI\StreetEatz\files`:

- `KCAI-FOOD-OS-BUSINESS-ANALYSIS.md`
- `KCAI-FOOD-OS-CONTROL-PLANE.md`
- `KCAI-FOOD-OS-SAAS-STRATEGY.md`
- `FOOD-OS-MODULE-REGISTER.md`
- `KCAI-FOOD-OS-BUILD-AND-QA-REGISTER.md`
- `KCAI-FOOD-OS-MASTER-AUDIT-2026-08-28.md`

Documents are reference material, not executable instructions. Kyle's current request and verified production state take precedence.

## 4. Architecture now in production

### Application and hosting

- React 18 + TypeScript + Vite + Tailwind/shadcn UI.
- Netlify hosts the production web app and `management-assistant` serverless function.
- Supabase owns Auth, Postgres, RLS, RPCs, Realtime and Edge Functions.
- The PWA has an install flow, update handling, manifest, offline page and generated icons.
- Capacitor 8 has generated an initial iOS/Xcode project; the live PWA remains the production customer app.
- `/account` now routes to the real `/profile` experience, removing the old fake loyalty card.

### Multi-client direction

- Client branding/configuration lives under `src/config/`.
- FoodOS module visibility is stored in `public.foodos_module_settings`.
- Danny can show/hide modules from the new FoodOS Settings tab.
- `public.set_foodos_module_enabled()` is an administrator-only RPC; the loyalty switch also synchronises `app_settings.loyalty_enabled`.
- Provider credentials must remain in deployment/Supabase secrets, never browser tables or source control.

### Security and evidence

- All eight new FoodOS tables have RLS enabled.
- Reporting views flagged by Supabase were converted to `security_invoker`.
- Trigger-only SECURITY DEFINER functions are no longer callable through the public API.
- The latest Supabase security advisor has **zero ERROR-level findings**.
- Marketing metrics accept provider/webhook/paid-order provenance; browser writes are blocked.
- Competitor snapshots require source type, observation time and optional evidence URL. Empty data stays empty.

## 5. Module-by-module state

### A. Web ordering and payments — live, hardening continues

Completed:

- Customer menu, cart, authentication and checkout.
- Online-card and pay-on-collection controls.
- Server-owned payment state interpretation.
- Payment integrity views, guards and QA checks.
- Card checkout session function and Viva callback handling.
- Kitchen dispatch gating prevents unpaid web-card orders reaching the kitchen.

Still required:

- Reconcile order `#908` (€10.50, 20 May 2026) against the payment provider. It is marked paid but has no independent webhook transaction reference.
- Resolve nine legacy orders still marked `processing` using real provider/till evidence. Never guess completed/failed.
- Terminal payment testing requires bank/terminal access.
- Add automated provider-reconciliation imports and exception ownership.

### B. QR ordering and Google-review QR — built foundation, live acceptance needed

Completed:

- Public `/qr/order` entry route.
- QR source/campaign capture is retained through checkout.
- Admin QR Hub generates ordering and review destinations.
- Direct Google review URLs are validated and configurable.

Still required:

- Physical-phone acceptance test from printed QR through paid order and kitchen dispatch.
- Confirm the live Google Business review destination.
- Generate final print-ready/NFC artwork and test NFC tags on iPhone and Android.
- Add per-location/table/campaign QR attribution once the single-location flow is signed off.

### C. PWA and App Store — PWA live; native release not submitted

Completed:

- Install page and PWA install prompt.
- Service-worker update handling and offline fallback.
- Apple/PWA icon set and manifest.
- Capacitor iOS project and App Store readiness notes in `docs/APP-STORE-READINESS.md`.
- Install page can show an App Store button when `VITE_APP_STORE_URL` is configured.

Still required:

- Mac/Xcode physical-device build.
- Apple signing, bundle/capability review, privacy declarations, screenshots and metadata.
- TestFlight testing, review notes and App Store submission.
- Apple Pay/Google Pay are payment-provider projects, not automatic PWA features; verify provider support first.

### D. Scheduled pre-orders — implemented but feature flag is off

Completed:

- Customer schedule picker.
- Dublin-time slot generation with DST tests.
- Notice windows, trading hours, capacity and kitchen-release timing.
- Scheduled order queue and hardening migration.

Still required:

- `app_settings.preorders_enabled` is currently false.
- Danny must approve operating hours, lead time, interval, capacity and max advance days.
- Run end-to-end paid and collection preorder tests before enabling production.
- Test cancellation/refund and capacity race cases.

### E. Loyalty — live rule and ledger, operational redemption needs completion

Completed:

- Immutable `loyalty_events` ledger and customer balance view.
- One point/stamp per verified paid order.
- Production setting: every seventh paid order unlocks **Free Chips**.
- Customer profile renders the real balance/configuration.
- No historical points were guessed or backfilled.

Still required:

- Decide whether the Free Chips are redeemed after the seventh paid order or applied inside that seventh transaction. Current behaviour unlocks after verified payment.
- Build a clear staff redemption control and audit view.
- Add reward-expiry/reversal/refund rules if Danny wants them.
- Test seven paid orders, one redemption, duplicate redemption rejection and refund reversal.

### F. Voice ordering — hardened backend, provider acceptance remains critical

Completed:

- `create-voice-order` validates menu/prices server-side.
- Idempotency and retry protection.
- Voice order channel attribution.
- Kitchen dispatch contract and retry outbox.
- Automated voice-order contract audit.

Still required:

- Vapi/Twilio live configuration review.
- Real-call acceptance testing: accents, background noise, modifiers, allergens, sold-out products, wait time, confirmation, hang-up/retry and human handoff.
- Confirm the caller's consent/recording language and retention policy.
- Verify live printing for a real voice order.
- A voice flow is not “bulletproof” until provider and physical-kitchen tests pass.

### G. Kitchen dispatch, printing and receipts — reliable code path; hardware proof pending

Completed:

- Payment-aware kitchen gate.
- Dispatch outbox, retries and error recording.
- Staff/KDS order handling improvements.
- Contract audit for dispatch/printing.

Still required:

- Connect/verify PrintNode production credentials and printer mapping.
- Physical print tests for web, QR, PWA, voice, scheduled and staff POS orders.
- Confirm modifier, removed ingredient, allergen, schedule time, payment status, order number and receipt totals are consistent.
- Add printer-offline alerts, reprint audit and duplicate-print protection acceptance tests.

### H. Review engine — strong foundation, operational sign-off required

Completed:

- Secure feedback tokens and tokenised public rating route.
- Post-collection review queue with timing/quiet-hour controls.
- Low-rating service-recovery routing and Google-link gating.
- Google review URL configuration and QR Hub support.
- Review coverage/feedback analytics views.

Current evidence:

- Review QA reports a 69.1% average ask rate.
- There are currently no orders due in the review queue.

Still required:

- Verify Twilio status callbacks and exact live message copy.
- Test 1–3 star recovery, 4–5 star Google path, expired/reused tokens and opt-out behaviour.
- Add owner response-time SLA and unresolved-complaint alerts.

### I. CRM — live core, expand carefully

Completed:

- Customer aggregation, spend/visit/last-order views and dietary notes.
- CRM spend was backfilled from paid orders only; the prior €6,802.34 variance now passes QA.
- Legacy profile roles were reconciled to `user_roles`, the role source of truth.

Still required:

- Rename any spend-based “loyalty tier” language to customer segment unless it uses the real loyalty ledger.
- Consent ledger and channel preference centre.
- Cohorts, lapse/churn risk, frequency, lifetime value, favourite items, offer history and service-recovery history.
- GDPR retention/export/delete workflows and staff audit log.

### J. SMS marketing — sending path exists; provider truth must drive reporting

Completed:

- Authenticated send-broadcast Edge Function.
- Consent/quiet-hour/STOP copy protections.
- Broadcast history and metric-provenance fields.
- “Savage Sunday Broadcast” renamed to **Weekly Broadcast**.
- SMS open rate is not shown because SMS has no reliable open event.

Still required:

- Confirm Twilio delivery-status webhooks populate accepted/delivered/failed counts.
- Campaign/order attribution for revenue.
- Audience preview, suppression count, scheduled sends and approval workflow.
- Community Vote is now stored safely as a two-option vote; automatic SMS/email distribution remains off until a verified channel is chosen.

### K. Email and ads — visible connection-ready modules, not connected

Completed:

- Separate Email and Ads tabs.
- Honest empty states and expected metric catalogues.
- `marketing_metrics` schema for verified provider ingestion.
- Module switches in Settings.

Still required:

- SendGrid/domain authentication, consent/suppression model, templates and event webhook.
- Google Ads API OAuth/account linking and reporting ingestion.
- Meta Marketing API OAuth/account linking and reporting ingestion.
- Paid-order attribution model, campaign IDs, UTMs, ROAS and cost-per-order reporting.
- Do not show opens/clicks/spend/conversions before provider evidence exists.

### L. Content engine and social — existing workspace, separate improvement stream

Completed:

- Content/social manager, idea/caption fields, scheduling concepts and post-now function.
- Client brand configuration is being extracted from hard-coded Street Eatz values.

Still required:

- Approve a Street Eatz visual/copy brand kit from the sample burger content.
- Reusable prompt templates, approval states, asset library and platform-specific variants.
- Real Meta/Instagram publishing permissions and webhook/result evidence.
- Content performance attribution.

### M. Business insights and owner reporting — live core plus roadmap

Completed live reporting:

- Paid revenue, order count, average order value and week-on-week change.
- Daily trading, cash/card split and channel mix for web/QR/PWA/voice/staff.
- Item units/revenue, meal periods and modifier attach rate.
- Peak day/hour heatmap.
- Average, median and P90 prep time.
- Customer count, returning rate and reporting data-health warnings.
- Collapsible single-section Analytics layout.
- Owner assistant has a secured, read-only business snapshot RPC.

Next owner-report catalogue:

1. **Profitability:** food cost, gross margin, contribution margin, discount leakage, packaging and delivery cost.
2. **Inventory:** stock cover days, projected run-out, waste, variance, theoretical vs actual usage and reorder recommendations.
3. **Labour:** labour cost %, sales per labour hour, roster coverage, overtime, lateness and demand-to-staff fit.
4. **End of day:** expected vs counted cash, card settlement, tips, refunds, voids, discounts and unresolved variance.
5. **Customer:** cohort retention, order frequency, churn/lapse risk, LTV, loyalty activation/redemption and segment movement.
6. **Operations:** acceptance-to-ready time, late-order rate, capacity breaches, cancellations, refunds, printer/dispatch failures and sold-out duration.
7. **Marketing:** delivery/click/conversion, attributed paid orders, revenue, cost per acquisition, ROAS, consent growth and opt-outs.
8. **Reviews:** rating, review velocity, sentiment themes, response time, recovery outcome and ask coverage.
9. **Food safety:** checklist completion, failed control points, corrective-action closure and repeat exceptions.
10. **Forecasting:** demand by half-hour/day/item using trading history, weather and local events, with confidence ranges.
11. **Owner reports:** opening brief, live exception alerts, end-of-day close and weekly executive report.

Every report needs a metric definition, source, timezone, freshness timestamp, owner and data-quality state.

### N. Competitor intelligence — new evidence-backed MVP

Completed:

- `competitor_profiles` and append-only `competitor_snapshots` tables.
- Admin-only RLS.
- Analytics accordion and watchlist UI.
- Empty-state policy: no inferred or invented competitor metrics.

Still required:

- Add chosen Waterford competitors.
- Snapshot editor/importer for rating, review count, menu count, entry price, average main price and offers.
- Evidence URLs, source timestamps and comparison history.
- Google Business data for Street Eatz and lawful public-source collection for competitors.
- Alerts for price/offer/review movement; no automated scraping that breaches provider terms.

### O. Operations MVP — foundations live, workflows incomplete

Completed:

- New Operations tab/accordion.
- Inventory items and immutable stock-movement ledger.
- Inventory balance view with reorder flag and recorded value.
- Add-first-stock-item UI and honest zero state.
- Secure roster shift table.
- Append-only HACCP/food-safety records; failed checks require corrective action.
- End-of-day module placeholder.
- Danny can hide each module in Settings.

Still required:

- Stock movement UI (delivery, use, waste, count adjustment, return), stocktake and supplier unit conversion.
- Recipe/BOM linkage from menu items to inventory consumption.
- Roster editor, availability, breaks, publishing, shift confirmation and notifications.
- HACCP templates, expected frequency, temperature limits, overdue alerts, signatures and evidence exports.
- Cleaning schedule, allergen change control and incident workflow.
- End-of-day cash/card/tip reconciliation and sign-off.
- Procurement, suppliers, purchase orders, goods received, invoice matching and supplier performance.

## 6. Management AI assistant state

Completed:

- Authenticated admin-only assistant surface.
- Read-only business snapshot based on real analytics.
- Menu/product lookup.
- Proposed product price/visibility/availability/sold-out changes.
- Proposed operating-setting changes.
- Explicit confirmation before mutation.
- Proposal expiry, audit trail and quota controls.
- Private server-side tools; browser never receives provider/database secrets.

Current external blocker:

- The Netlify team is on a legacy Starter plan and its AI Gateway is unavailable.
- The function supports a private `OPENAI_API_KEY` as the fallback. Add it to Netlify function/runtime environment and redeploy, or upgrade/resolve AI Gateway availability.

Next assistant tools:

- Inventory lookup/stock adjustment proposals.
- Scheduled order/capacity lookup.
- Loyalty/customer insights without exposing unnecessary personal data.
- EOD, weekly report and anomaly summaries.
- Competitor snapshot questions with citations.
- Roster read/planning proposals after the process is approved.
- All write tools must remain propose → preview → confirm → apply → audit; never direct free-form mutation.

## 7. Current production data blockers

The database QA gate currently reports:

- **P0 DAT-03:** 11 visible products have no confirmed allergen record. These must be completed from Danny's recipes/supplier labels; do not infer allergens from descriptions.
- **P0 PAY-02:** order `#908`, €10.50 card payment, requires provider reconciliation.
- **P1 PAY-17:** nine legacy orders are still `processing`; resolve from provider/till evidence.
- **P2 DAT-07:** 14 known test orders remain. The visible product named “Test” has been hidden. Do not delete historical orders without an approved retention/audit decision.
- **Info:** 69 cash orders are awaiting till reconciliation; the EOD module should own this workflow.

These are data/operations blockers, not reasons to invent corrections in code.

Products awaiting allergen confirmation:

- 7-up
- American Bacon & Double Cheese Burger
- Dirty BBQ Bacon Fries
- Jerk Chicken Salad
- Kids chip
- Large Sloppy Jose Fries
- Sloppy Jose Fries
- The Godfather of Beef
- The Jalapeño Popper Burger
- The Texas Melt
- Truffle Parmesan Fries

## 8. Automated QA already completed

Current local release evidence:

- Production Vite build passes.
- TypeScript `--noEmit` passes.
- ESLint passes.
- 24/24 application unit tests pass.
- 12/12 management-assistant function contract checks passed in the prior release gate.
- 18/18 assistant database/security/analytics checks passed in the prior release gate.
- 13/13 voice-order contract checks passed in the prior release gate.
- 8/8 kitchen dispatch/printing contract checks passed in the prior release gate.
- Architecture audit previously reported no critical/high findings.
- PWA audit passed.
- Netlify secret scan passed on deploy `6a94c6559a910402f8c383d0` with zero matches.
- Supabase advisor: zero ERROR-level security findings after the latest hardening migration.

Tests prove contracts and build integrity; they do not replace physical phone, printer, payment, kitchen or App Store acceptance tests.

## 9. Required commands before every handoff to Codex QA

The normal commands are:

```text
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run audit:architecture
npm run audit:assistant-db
npm run audit:assistant-function
npm run audit:kitchen-dispatch
npm run audit:voice-order
npm run audit:pwa
```

On this Windows machine the roaming `npm`/`npx` wrapper is currently broken. A working fallback is:

```text
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" <npm arguments>
```

Fix the local npm installation separately; do not change application code to work around a machine-level wrapper problem.

## 10. Recommended implementation order for Claude Code

### Sprint 0 — protect and understand the work

- Create the safe git checkpoint.
- Run the complete local test/audit suite.
- Compare migration files to live migration history.
- Do not replay applied migrations or regenerate the iOS project destructively.

### Sprint 1 — production blockers and physical acceptance

- Build an allergen-completion admin workflow and obtain Danny-confirmed records.
- Add payment exception/reconciliation UI; investigate #908 and nine processing orders without mutating until evidence is available.
- Complete real QR → checkout → payment → kitchen → print test.
- Complete real voice → confirmation → kitchen → print test.
- Complete seventh-order loyalty and redemption test.

### Sprint 2 — finish core owner operations

- End-of-day reconciliation first, because 69 cash orders already need it.
- Inventory movements, stocktake, waste and recipe/BOM consumption.
- Roster editor and publish workflow.
- HACCP templates, limits, due/overdue controls and corrective-action follow-up.
- Supplier/procurement records after inventory units are stable.

### Sprint 3 — activate intelligence and marketing connections

- Resolve assistant model access through Netlify AI Gateway or private OpenAI key.
- SendGrid event ingestion and email consent/suppression.
- Twilio delivery callbacks and campaign revenue attribution.
- Google Business owner metrics and competitor watchlist.
- Google Ads/Meta Ads OAuth and verified reporting.
- Owner opening/EOD/weekly report engine.

### Sprint 4 — reusable SaaS extraction

- Replace remaining Street Eatz constants with tenant configuration.
- Add tenant/location IDs to new canonical records before onboarding client two.
- Separate feature entitlement from tenant preference where billing requires it.
- Provider adapter interfaces, per-tenant secrets, audit/event model and onboarding checklist.
- Add contract tests proving one tenant cannot read or mutate another tenant.

### Sprint 5 — App Store release

- Xcode signing/device checks, privacy manifest, screenshots and TestFlight.
- Native deep links, push-notification decision and payment-provider capability review.
- Publish App Store button only after Apple provides the listing URL.

## 11. Definition of done for every module

A module is not “done” because a tab exists. It is done only when all are true:

- User journey and failure states are defined.
- Canonical records and ownership are defined.
- RLS/permissions are tested for admin, staff, customer and anonymous roles.
- Writes are server-validated and idempotent where retries can occur.
- Metrics have real provenance and freshness.
- Loading, empty, partial, offline and provider-error states are visible.
- Automated unit/contract/integration tests pass.
- Manual production acceptance evidence is recorded.
- Monitoring, retry, alerting and recovery instructions exist.
- Feature can be disabled without deleting records.
- Tenant-specific branding/provider details are configuration.
- Documentation and rollback plan are updated.

## 12. Claude Code / Codex operating model

### Claude Code owns

- Day-to-day implementation and refactoring.
- Database migrations and Edge/Netlify function changes.
- UI workflows and module completion.
- Adding tests with each change.
- Keeping this handoff and the FoodOS module register updated.

### Codex owns

- Independent diff/code review before production.
- Supabase RLS/security/performance advisor checks.
- Payment/order/data-integrity QA.
- Automated test, build, PWA, assistant, voice and kitchen contract gates.
- Live browser smoke tests and evidence capture.
- Netlify release verification and rollback readiness.
- Calling out unsupported “production-ready” claims.

### Handoff format from Claude to Codex

For every release candidate Claude should provide:

1. Scope and user-visible behaviour.
2. Exact files and migrations changed.
3. Data migration/backfill impact.
4. Security/RLS impact.
5. Automated tests added and results.
6. Manual tests completed and still required.
7. Environment/provider changes.
8. Known limitations and rollback plan.

Codex then independently verifies and returns: **pass**, **pass with explicit limitations**, or **block**, with evidence.

## 13. Immediate instruction to Claude Code

Start with Sprint 0 and Sprint 1. Do not start new visual modules until the allergen, payment-exception, QR/voice/printing and loyalty acceptance paths are controlled. The dashboard architecture now exposes the right modules; the highest-value work is closing the evidence and operational loops beneath them.

