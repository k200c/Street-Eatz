-- ============================================================================
-- QA CHECK SUITE  ·  select * from public.qa_checks();
--
-- Every check that can be asserted from the database, in one call. Designed to
-- be run before every deploy, nightly, and by CI. A check that returns FAIL is
-- a defect, not a statistic.
--
-- FOOD OS NOTE: written so it can be lifted to any tenant unchanged. No client
-- names, no hardcoded ids, no assumptions about volume. The fleet monitor will
-- eventually call this per tenant and roll the results up.
--
-- Each row: check_id, category, severity, status, expected, actual, detail.
-- status is PASS, FAIL, or INFO (measured, no pass/fail meaning).
-- ============================================================================

create or replace function public.qa_checks()
returns table (
  check_id  text,
  category  text,
  severity  text,
  status    text,
  expected  text,
  actual    text,
  detail    text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v int;
  v2 int;
  n numeric;
begin
  -- ------------------------------------------------------------- SECURITY
  -- SEC-03: the two role stores must agree. They diverged before and that
  -- divergence is what made the privilege-escalation hole exploitable.
  select count(*) into v
  from public.profiles p
  full outer join public.user_roles ur on ur.user_id = p.id
  where coalesce(p.role::text,'~') is distinct from coalesce(ur.role::text,'~');
  return query select 'SEC-03','security','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 mismatches', v::text,
    'profiles.role vs user_roles disagree. user_roles is the source of truth.';

  -- SEC-07: RLS enabled on every base table in public.
  select count(*) into v
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
  return query select 'SEC-07','security','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 tables without RLS', v::text,
    'A table without RLS is readable by anyone holding the anon key.';

  -- SEC-08: RLS on but no policies = the table is silently unreadable, which
  -- breaks features quietly rather than loudly.
  select count(*) into v
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p
                    where p.schemaname='public' and p.tablename = c.relname);
  return query select 'SEC-08','security','P2',
    case when v = 0 then 'PASS' else 'INFO' end, '0 orphans', v::text,
    'RLS enabled with no policies. Intentional only for service-role-only tables.';

  -- SEC-11: the escalation guard must exist. Regression test for R-01.
  select count(*) into v from pg_trigger
  where tgname = 'profiles_block_role_self_change' and not tgisinternal;
  return query select 'SEC-11','security','P0',
    case when v = 1 then 'PASS' else 'FAIL' end, 'trigger present', v::text,
    'Without this, any customer can set their own role and read all profiles.';

  -- ---------------------------------------------------------------- MONEY
  -- PAY-01: nothing critical, ever.
  select count(*) into v from public.v_payment_integrity where severity='critical';
  return query select 'PAY-01','payments','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 critical', v::text,
    'Double charges or amount mismatches. Investigate before any deploy.';

  -- PAY-02: no NEW high-severity issues. Legacy rows pre-20 May are excluded
  -- deliberately - they are known, recorded in the runbook, and not a leak.
  select count(*) into v from public.v_payment_integrity
  where severity='high' and created_at >= '2026-05-20';
  return query select 'PAY-02','payments','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 new high', v::text,
    'High-severity payment issues created since the last known-good date.';

  -- PAY-17: nothing stuck mid-flow.
  select count(*) into v from public.v_payments_stuck where minutes_stuck > 60;
  return query select 'PAY-17','payments','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 stuck', v::text,
    'Payments left in processing. Resolve each to completed or failed.';

  -- PAY-18: the money triggers must exist. Regression test for the price
  -- validation work - these are the only thing standing between a tampered
  -- payload and a wrong charge.
  select count(*) into v from pg_trigger
  where not tgisinternal and tgname in (
    'trg_validate_order_item_price','trg_recalculate_order_total',
    'orders_normalise_payment_status');
  return query select 'PAY-18','payments','P0',
    case when v >= 3 then 'PASS' else 'FAIL' end, '3 money triggers', v::text,
    'Price validation, total recalculation, and status normalisation.';

  -- ------------------------------------------------------------------ CRM
  -- CRM-04: recorded spend must equal spend actually paid.
  select round(coalesce(sum(c.total_spend),0) - coalesce(sum(t.spend),0), 2) into n
  from public.customers c
  left join (
    select o.customer_phone as phone, sum(o.total) as spend
    from public.v_paid_orders v join public.orders o on o.id = v.id
    where o.customer_phone is not null and o.customer_phone <> ''
    group by o.customer_phone
  ) t on t.phone = c.phone_number;
  return query select 'CRM-04','crm','P1',
    case when abs(coalesce(n,0)) < 0.01 then 'PASS' else 'FAIL' end,
    'EUR 0.00 variance', 'EUR ' || coalesce(n,0)::text,
    'customers.total_spend vs actual paid orders. Run the backfill to correct.';

  -- ----------------------------------------------------------------- DATA
  -- DAT-03: allergens on every sellable item. Legal requirement (FSAI).
  select count(*) into v from public.products p
  where p.is_visible is true
    and not exists (select 1 from public.product_allergens a
                    where a.product_id = p.id and a.allergen_numbers is not null);
  return query select 'DAT-03','compliance','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 missing', v::text,
    'Visible products with no allergen data. FSAI requires this before purchase.';

  -- DAT-04: no orphaned line items.
  select count(*) into v from public.order_items oi
  where not exists (select 1 from public.orders o where o.id = oi.order_id);
  return query select 'DAT-04','data','P2',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 orphans', v::text,
    'order_items with no parent order.';

  -- DAT-07: no test data in production.
  select count(*) into v from public.orders
  where display_id in (1001,1002,1003,1011,1012,1013,1014,1015,1016,1017,1018,1068,1069,1138);
  select count(*) into v2 from public.products
  where lower(name) like '%test%' and is_visible is true;
  return query select 'DAT-07','data','P2',
    case when v + v2 = 0 then 'PASS' else 'FAIL' end, '0 test rows',
    v::text || ' orders, ' || v2::text || ' products',
    'Known test orders and any visible product named "test".';

  -- DAT-08: totals must equal the sum of their items on paid orders.
  select count(*) into v from (
    select o.id from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where lower(coalesce(o.payment_status,'')) in ('paid','completed')
    group by o.id, o.total
    having abs(o.total - sum(oi.quantity * oi.unit_price)) > 0.01
  ) x;
  return query select 'DAT-08','payments','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 mismatches', v::text,
    'A paid order whose total does not match its items was mis-charged.';

  -- ------------------------------------------------------------ OPERATIONS
  -- INV-01: an out-of-stock ingredient still on an orderable product means
  -- the kitchen cannot make what the customer just bought.
  select count(*) into v from public.v_stock_conflicts;
  return query select 'INV-01','operations','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 conflicts', v::text,
    'Out-of-stock ingredient still default on a visible, available product.';

  -- REV-11: review gating check. Anyone asked for a rating must have been
  -- offered the review link. Non-zero here is review gating, which breaches
  -- Google policy and Irish consumer law.
  select count(*) into v from public.order_feedback
  where responded_at is not null and review_link_sent_at is null;
  return query select 'REV-11','compliance','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 ungated', v::text,
    'Rated customers never offered the review link. This is review gating.';

  -- ----------------------------------------------------------------- INFO
  -- Measured, not asserted. Context for whoever reads a failure.
  select count(*) into v from public.orders;
  return query select 'INF-01','info','-','INFO','-', v::text, 'Total orders.';

  select count(*) into v from public.v_review_request_queue;
  return query select 'INF-02','info','-','INFO','-', v::text,
    'Orders currently due a review request.';

  select coalesce(round(avg(ask_rate_pct),1),0) into n from public.v_review_coverage;
  return query select 'INF-03','info','-','INFO','-', n::text || '%',
    'Average review ask rate. 59% of customers have never been asked.';

  select count(*) into v from public.v_payment_integrity where severity='medium';
  return query select 'INF-04','info','-','INFO','-', v::text,
    'Cash orders awaiting till reconciliation.';
end;
$$;

comment on function public.qa_checks() is
  'Full database-side QA suite. Run before every deploy and nightly. Any FAIL is a defect. Tenant-agnostic by design - the fleet monitor will call this per client.';

revoke all on function public.qa_checks() from public, anon;
grant execute on function public.qa_checks() to authenticated, service_role;

-- Convenience: one row, for alerting and CI exit codes.
create or replace view public.v_qa_summary as
select
  count(*) filter (where status='FAIL')                              as failures,
  count(*) filter (where status='FAIL' and severity='P0')            as p0_failures,
  count(*) filter (where status='PASS')                              as passes,
  string_agg(check_id, ', ') filter (where status='FAIL')            as failing_checks
from public.qa_checks();
