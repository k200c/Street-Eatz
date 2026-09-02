# Overnight audit — 1→2 September 2026

Things I could not safely complete, or completed with a caveat that matters. Each entry states what is VERIFIED, what is INFERRED, and what is UNKNOWN. The person reading this at 7am has a truck opening in 36 hours; severity is judged against that.

---

## 1. `is_store_open` must be flipped on Thursday morning — **reopening blocker**

- **Trying to do:** nothing — this is a warning, not a task.
- **VERIFIED:** `get_store_status()` returns `reason: closed_manually`, `accepting_orders: false` (snapshot 00:57 UTC and again at the end of the night). Every customer surface now reads that one answer, so the site will correctly refuse orders all day Thursday until someone toggles the store open in the Command Center.
- **Kyle must:** flip **Store Open** in Command Center → Operations on Thursday before 12:00. There is no schedule that does it automatically.
- **Severity:** P0 for reopening. **Affects Thursday: yes — the whole day.**

## 2. Eleven visible products have no allergen data — **reopening blocker, not code**

- **VERIFIED:** `qa_checks()` → `DAT-03`, severity P0, actual `11`, "Visible products with no allergen data. FSAI requires this before purchase."
- **What the code does now:** the desktop card renders "Allergens: ask staff" for those 11 rather than hiding the gap. That is honest, not compliant.
- **Kyle / Danny must:** fill the 11 in the admin product editor. The check goes green on its own.
- **Severity:** P0. **Affects Thursday: yes.**

## 3. `PAY-02` — one high-severity payment issue awaits a Viva dashboard lookup

- **VERIFIED:** `qa_checks()` → `PAY-02`, P0, "High-severity payment issues created since the last known-good date", actual `1`. The brief identifies it as order #908.
- **Boundary:** payment path — not touched.
- **Kyle must:** look #908 up in the Viva dashboard and reconcile.
- **Severity:** P0 by the suite's own classification; a single historical order. **Affects Thursday: no.**

## 4. Email broadcasts have no sending path

- **Trying to do:** the unified composer with SMS / email / both.
- **VERIFIED:** `supabase/functions/send-broadcast/index.ts` accepts `title`, `message`, `image_url` only (lines 74–123) and forwards to the SMS workflow. No email provider is configured anywhere in the repo.
- **VERIFIED:** `v_broadcast_reach.reachable_email = 0` of 185 customers.
- **What I built:** the composer records `channels`/`broadcast_type`/`email_subject` and writes `sent_email_count = 0` when email is chosen. The email checkbox is disabled while reach is 0 and reads "0 recipients". It never claims to send.
- **Kyle must decide:** which email provider (Resend, Postmark, SES) and whether email is worth it while zero customers have an address on file.
- **Recommendation:** fix §5 first; email is pointless until the list has addresses.
- **Severity:** P2. **Affects Thursday: no.**

## 5. `customers` has never stored an email address

- **VERIFIED:** `reachable_email = 0`. Checkout collects email as optional; the `customers` upsert path does not persist it.
- **Boundary:** the fix is in the order/customer write path (trigger `update_customer_on_order` or the checkout insert) — **not touched tonight**.
- **Kyle must decide:** add `email` to the customer upsert (migration on `customers` — forbidden tonight under rule 6) and decide consent wording at checkout.
- **Recommendation:** one nullable column plus the trigger change, with an explicit marketing-consent checkbox. Under 2 hours, but it is a `customers` table change and a checkout change, so it needs a daytime review.
- **Severity:** P2. **Affects Thursday: no.**

## 6. AI provider key in the Netlify environment — **UNKNOWN**

- **Trying to do:** confirm the assistant works end to end.
- **VERIFIED:** `POST /.netlify/functions/management-assistant` on production returns `401 {"error":"Please sign in as an administrator."}` as JSON. The function is deployed and runs.
- **UNKNOWN:** whether `OPENAI_API_KEY` (or `NETLIFY_AI_GATEWAY_KEY`) is set. The 401 happens before any AI call, and I have no Netlify CLI or MCP access to read the build environment.
- **What I built:** the typed error path means a missing key now surfaces as a readable JSON error instead of a parse crash.
- **Kyle must:** sign in as admin and send one chat message. Either it answers, or it states the missing key plainly.
- **Severity:** P1 for the assistant, P3 for reopening. **Affects Thursday: no.**

## 7. Hero H1 shift — cause identified by arithmetic, fix not browser-measured

- **VERIFIED:** `MarketingBanner` renders only after `app_settings` loads; `py-2` + `text-sm` = 36px, the exact figure the browse test measured.
- **INFERRED:** that this is the whole cause. There could be a second contributor (font swap) I have not ruled out.
- **What I built:** a held 36px slot while settings load, remembered per visitor.
- **Kyle must:** open the homepage on a phone and watch the hero. If it still moves, the remainder is elsewhere.
- **Severity:** P2. **Affects Thursday: no.**

## 8. The 14-day snapshot RPC returns no prep time — INFERRED cause

- **VERIFIED:** `v_prep_time` has 0 rows in the last 14 days and 71 rows / 398 orders all-time. The panel now reads the view directly.
- **INFERRED:** `get_management_business_snapshot(14)` returned `prep_time: null` for that reason. I could not call it — it raises `42501 Admin access required` from the MCP session — so this is reasoned, not observed.
- **Recommendation:** either widen the snapshot's window or drop `prep_time` from it now that the panel has its own source. Two sources for one number is how this started.
- **Severity:** P3. **Affects Thursday: no.**

## 9. Not wired tonight: content module, roster, staff, end of day

- **VERIFIED contracts:** `v_media_available`, `v_weekly_content_plan`, `v_content_planning_status`, `approve_media_asset(uuid, boolean, text)`, `v_labour_cost_daily`, `v_roster_vs_demand`, `v_staff_hours_summary`, `close_trading_day(date, numeric, text)`, `v_end_of_day_pending` (27 rows) all exist with the documented columns.
- **VERIFIED:** `v_labour_cost_daily` has 0 days with shifts — every labour column is null. The Labour panel says so rather than showing zeros.
- **Why not built:** each is a full UI module with forms and write paths. Building four of them at 3am after the P1 list is how a plausible-but-wrong screen ships. The analytics *reads* for labour and roster are wired; the *write* surfaces are not.
- **Kyle must decide:** priority order. My recommendation: End of day first (27 days pending, it is a cash-reconciliation control), then roster (labour cost is unknowable until shifts carry a rate), then content.
- **Severity:** P2. **Affects Thursday: no.**

## 10. `enquiry` edge function is written, not deployed

- **Boundary:** rule 1 — no deploy.
- **VERIFIED:** `config.toml` now has `[functions.enquiry] verify_jwt = false`; `ALLOWED_ORIGINS` is already set on the project (seen in `supabase secrets list` on 1 Sept).
- **Kyle must run:** `supabase functions deploy enquiry --project-ref svbilfaanpiyieyxbsss`
- Until then the `/catering` form returns "That did not send" — the mailto/phone block above it still works.
- **Severity:** P2. **Affects Thursday: no.**

## 11. The `/api/management-assistant` redirect is still unshipped — but no longer matters

- **VERIFIED:** production `/api/…` returns `text/html` (SPA fallback); `/.netlify/functions/…` returns JSON. `netlify.toml` is in the unshipped set.
- **What I built:** the app calls the function's own path directly. The redirect is now redundant.
- **Severity:** none. Recorded so nobody re-diagnoses it.

## 12. `v_item_trend` has five values, not three

- **VERIFIED:** `falling=8, new=6, rising=3, steady=4, stopped selling=10`. The brief listed rising / falling / steady. The panel renders all five; "stopped selling" reads as falling for colour.
- **Severity:** none — noted as a contract mismatch.

## 13. Two untracked product-spec documents from other sessions

- `docs/COMPETITOR-INTELLIGENCE-V1-PRODUCT-SPEC-2026-09-02.md` and `docs/SMART-CONTENT-STUDIO-V1-PRODUCT-SPEC-2026-09-01.md` appeared during the night. Not mine, not read, not committed, left in place.

## 14. The 207-file deploy decision is still open

- Everything on `feature/production-readiness` — the SEO build, both P0 fixes from CC-7, the assistant fix, and tonight's work — ships together or not at all, because `main` is 5 commits behind the checkpoint the branch descends from.
- **Kyle must decide** the route: merge as one, or fast-forward `main` to the checkpoint first as its own reviewable step. Recommended deploy order is in the morning report.
- **Severity:** this gates every user-visible fix. **Affects Thursday: yes, if the fixes are wanted for reopening.**
