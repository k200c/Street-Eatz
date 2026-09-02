# Overnight report — 1→2 September 2026

Branch: `feature/production-readiness` · 11 commits tonight (`374f878` → `HEAD`) · nothing deployed, nothing pushed to `main`, nothing sent, nothing spent, no migrations, no data deleted.

---

## ⚠️ Two things stand between this and a customer on Thursday. Neither is code.

**1. `is_store_open` is `false` and nothing flips it automatically.** `get_store_status()` returned `reason: closed_manually` at the start of the night and at the end. Every customer surface now reads that single answer — which is the fix — and it means the site will correctly refuse every order on Thursday until someone opens the store in Command Center → Operations before 12:00. There is no schedule.

**2. Eleven visible products have no allergen data.** `qa_checks()` → `DAT-03`, P0: *"Visible products with no allergen data. FSAI requires this before purchase."* The desktop cards now say "Allergens: ask staff" for those eleven instead of hiding it. That is honest; it is not compliant. Danny fills them in the product editor and the check clears itself.

---

## 1. Verdict

The system is better than it was at 00:57, and it is better in the way that matters: numbers that were fabricated or misread are now measured or absent, and the two contradictions a customer could see on Tuesday (store open *and* closed; add-to-cart before allergens) are closed on the branch. **Would I put a real customer through it today?** Through *production as it stands right now* — no, for the same two reasons the browse test gave: production still has the store-status contradiction and the desktop allergen gap, because none of this is deployed. Through *this branch, deployed, with the store toggled open and the eleven allergens filled* — yes for ordering, which is the proven core and was not touched. The admin surfaces on this branch have still never been browsed by a person; they pass typecheck, lint, 62 tests and a clean build, and that is not the same thing.

## 2. What shipped — with evidence

| Commit | What | Evidence |
|---|---|---|
| `48fd032` (CC-8, verified in place tonight) | **P0 assistant.** Endpoint corrected, typed error path, `get_management_insight` registered | Production `/.netlify/functions/management-assistant` → `401 application/json`; `/api/…` → `404 text/html <!doctype html>` — the reported error reproduced against production, cause identified as the unshipped `netlify.toml` redirect, not the dev server and not an unshipped function. 9 tests pin it. |
| `374f878` | Recovered Codex's voice-agent audit from the CC-7 stash | `node --check` passes; stash dropped after recovery |
| `027cf46` | **P1 analytics.** Prep time from `v_prep_time`, quoted-wait warning from `v_wait_time_accuracy`, ten views wired with four states each | `v_prep_time` last 14 days: **0 rows** (VERIFIED — the cause of "No data"); all-time weighted **19.4 avg / 16.0 median / 30.1 p90 over 398 orders** (VERIFIED, matches the brief). Wait accuracy **52.2% slower than the 20 min quoted, p90 35.4** → rendered critical. Test reproduces 19.4 and the verdict. `revenue_generated` is unselectable; a test asserts it. |
| `7b40a71` | **P1 layout.** Sections sort by `display_order`, open by `default_expanded`, session-only overrides | Live rows verified: marketing 10–70 open, intelligence 80 closed, operations 100–140 closed. 5 tests against those rows. |
| `dc1ca9b` | **P1 broadcasts.** One composer, channel choice, reach before send, fabricated metrics removed | `v_broadcast_reach`: **185 total, 185 SMS, 0 email** (VERIFIED). Email shows "0 recipients", disabled. Default = SMS (cheapest that reaches anyone); both never pre-ticked — tested. "Attributed Revenue" tile gone. Nothing was sent. |
| `ba9688e` | **P2 hero shift.** 36px slot held while settings load | Banner = py-2 + text-sm = 36px, the exact browse-test figure. **INFERRED** cause; not browser-measured. |
| `3de6775` | **P2 catering form** → `enquiry` edge function → `submit_enquiry()` | Function written to the `feedback` pattern; `config.toml` entry added; **not deployed** (rule 1). `v_enquiry_queue` 0 rows. |
| `be021ab` | **P2 loyalty guest state**; card reads `v_loyalty_progress` | 53% guest orders → signed-out prompt on the homepage. `points_per_reward` from the view (live value 7, not the hardcoded 5). |
| `f38fe2c` | **P3 `docs/EXTRACTION-AUDIT.md`** | Repo-wide sweep, 210 raw hits, every value mapped to a `client_config` key. Headline: identity is already centralised; the debt is five copies of the hours, the menu model in `ProductSheet` + a DB enum, brand colour, and generated assets. |
| `a923bbd` · `+1` | `OVERNIGHT-AUDIT.md` (14 entries), 4 runbooks, `API.md`, `ARCHITECTURE.md` | — |

Also VERIFIED and closed without a change: `supabase/config.toml` already names `svbilfaanpiyieyxbsss` (the P2 item was stale); the P0 assistant fix from CC-8 was intact.

**Checks at end of night:** `tsc` clean of my code (4 pre-existing errors in files I never touched, unchanged), `lint` 0, **62 tests / 0 failures**, `npm run build` exit 0 with 7 prerendered pages, `npm ci` passes on a clean clone (verified 1 Sept).

## 3. Audited instead of fixed

Full entries in `docs/OVERNIGHT-AUDIT.md`. In one line each:

- **Email sending** — no provider connected; `send-broadcast` is SMS-only (VERIFIED from source). Recorded honestly, never faked.
- **`customers` has never stored an email** — 0 of 185 reachable. Fix is on the order-write path → not tonight.
- **AI provider key** — UNKNOWN. The 401 proves the function runs, not that a key exists. One admin chat message settles it.
- **Content module, roster/staff, end of day** — contracts verified, write surfaces not built. Four UI modules at 3am is how a plausible-wrong screen ships. End of day first (27 days pending).
- **Labour panel is empty** — 0 shifts carry a rate (VERIFIED). It says so.
- **The 14-day snapshot RPC** is admin-only from SQL, so its null `prep_time` is INFERRED from the closure dates. The panel no longer depends on it.
- **`v_item_trend` has five values**, not three (`new`, `stopped selling` too). Handled.
- **The deploy decision** — `main` is 5 commits behind the checkpoint; the branch ships ~207 files or nothing.

## 4. `qa_checks()` — before and after

| | Start (00:57 UTC) | End (01:19 UTC) |
|---|---|---|
| PASS | 18 | 18 |
| FAIL | 2 — `DAT-03`, `PAY-02` | 2 — `DAT-03`, `PAY-02` |
| INFO | 6 | 6 |

Unchanged, as expected: both failures await people. Baseline safety query, start and end:

```
visible_products=38 · orders=1148 · order_items=2292 · order_triggers=9 · p0_failures=2 · store_status=closed_manually
```

Identical. No number moved. No migration was applied.

## 5. What got worse — say it plainly

- **More unbrowsed code.** Every screen on this branch, including tonight's, has been verified by compiler, linter, tests and build — not by a human looking at it. That was true at 00:57 and it is more true now. The analytics accordion went from 7 sections to 12.
- **The separate Email tab is gone** from Marketing. Its connection-status panel (`MarketingConnectionPanel channel="email"`) is no longer reachable from the UI. The composer replaces the *sending* surface, not the *connection* one — if you used that panel, it needs a home.
- **Bundle size** for the analytics chunk was not measured before and after. It has grown; by how much is UNKNOWN.
- **The hero fix is reasoned, not observed.** If the H1 still moves on a phone, a second contributor exists.
- **One shell mistake cost a round trip** — a heredoc quoting failure skipped a patch silently; I caught it because the checks ran on the wrong state. It's the reason the patch scripts are files now. No damage.

## 6. Three things Kyle should do first

1. **Decide the deploy route, then deploy** — see order below. Until this ships, production still has both browse-test P0s. Then `supabase functions deploy enquiry --project-ref svbilfaanpiyieyxbsss`.
2. **Thursday before 12:00: open the store** in Command Center, and get Danny's eleven allergens in before service. Both are one-person jobs; both are P0.
3. **Sign in as admin and do two things:** send one assistant message (proves or disproves the provider key), and open Analytics → Operations & service speed — it should read **19.4 min** with a red banner saying **52% of orders take longer than the 20 min quoted**. If it does, the wiring is right; then decide what to quote on Thursday.

## 7. Reopening readiness — true by Thursday morning, not true now

| Must be true | Now | Who |
|---|---|---|
| `is_store_open = true` | false | Kyle/Danny, Thursday AM, manual |
| 0 visible products without allergen data | 11 | Danny |
| Production serves one store-status answer | contradiction live on prod | deploy |
| Desktop cards disclose allergens before add | gap live on prod | deploy |
| `/rate/:token` reachable | function deployed 1 Sept; page unshipped | deploy |
| `enquiry` function deployed | written only | one command |
| Quoted wait time reflects the kitchen | 20 min quoted, 52% miss it | operator decision |
| `PAY-02` #908 reconciled | open | Viva dashboard — not blocking service |

## Recommended deploy order

1. Fast-forward `main` to `checkpoint/foodos-2026-08-31` **as its own step** and let Netlify build it. Check `/sitemap.xml` is still the SPA fallback (it should be — that proves the baseline). This isolates "the FoodOS work" from "the fixes" for rollback.
2. Merge `feature/production-readiness` → `main`. Verify in this order: `curl -s https://streeteatzwaterford.ie/menu | grep "Urban Legend"` (prerender live) · `/sitemap.xml` returns XML · `/details` and the homepage agree on open/closed · a desktop product card shows allergen tags · `/rate/anything` renders "This link has expired".
3. `supabase functions deploy enquiry --project-ref svbilfaanpiyieyxbsss`, then the curl in `docs/runbooks/catering-enquiry.md`.
4. Thursday: open the store, place one cash order end to end, watch it reach the KDS and the printer. Then serve.
