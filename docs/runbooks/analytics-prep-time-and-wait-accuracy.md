# Runbook — "No average prep time" and the quoted-wait warning

**Symptom.** Analytics → Operations & service speed shows "No data" for average prep time while the database plainly has timing data.

**Cause (VERIFIED 2 Sept).** The panel read `prep_time` from `get_management_business_snapshot(14)`. `v_prep_time` has 0 rows in the last 14 days (closure 16 Aug – 3 Sep) and 71 rows / 398 orders all-time, so the 14-day window was legitimately empty.

**Fix.** `ServiceSpeedPanel` (`src/components/staff/InsightSections.tsx`) reads `v_prep_time` directly via `usePrepTime()` and aggregates with `weightedPrepTime()` in `src/lib/insights.ts` — **order-weighted**, which gives 19.4 min on real data. A mean of daily means gives 23.2 and would silently disagree with the reported figure. The old snapshot-based card is removed so there is one source.

The same panel renders `v_wait_time_accuracy` through `waitTimeVerdict()`: ≥50% of orders slower than quoted → critical, ≥30% → warning. Tonight: quoted 20, median 20.3, p90 35.4, 52.2% slower → critical.

**Verify.** `select * from v_wait_time_accuracy;` and compare to the banner. `npm test` covers the weighting and the verdict thresholds against those exact figures.

**Reversible.** Yes — `git revert` of the commit; no schema change.

**Operator note.** The honest fix for the warning is not in software: quote 35–40 minutes at peak, or remove the bottleneck. A quote the kitchen hits half the time is a review generator.
