-- Fix: the OUT parameter `severity` shadowed v_payment_integrity.severity.
-- Every reference to that column is now alias-qualified.

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
  select count(*) into v
  from public.profiles p
  full outer join public.user_roles ur on ur.user_id = p.id
  where coalesce(p.role::text,'~') is distinct from coalesce(ur.role::text,'~');
  return query select 'SEC-03','security','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 mismatches', v::text,
    'profiles.role vs user_roles disagree. user_roles is the source of truth.';

  select count(*) into v
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
  return query select 'SEC-07','security','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 tables without RLS', v::text,
    'A table without RLS is readable by anyone holding the anon key.';

  select count(*) into v
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p
                    where p.schemaname='public' and p.tablename = c.relname);
  return query select 'SEC-08','security','P2',
    case when v = 0 then 'PASS' else 'INFO' end, '0 orphans', v::text,
    'RLS enabled with no policies. Intentional only for service-role-only tables.';

  select count(*) into v from pg_trigger
  where tgname = 'profiles_block_role_self_change' and not tgisinternal;
  return query select 'SEC-11','security','P0',
    case when v = 1 then 'PASS' else 'FAIL' end, 'trigger present', v::text,
    'Without this, any customer can set their own role and read all profiles.';

  select count(*) into v from public.v_payment_integrity pi where pi.severity = 'critical';
  return query select 'PAY-01','payments','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 critical', v::text,
    'Double charges or amount mismatches. Investigate before any deploy.';

  select count(*) into v from public.v_payment_integrity pi
  where pi.severity = 'high' and pi.created_at >= '2026-05-20';
  return query select 'PAY-02','payments','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 new high', v::text,
    'High-severity payment issues created since the last known-good date.';

  select count(*) into v from public.v_payments_stuck s where s.minutes_stuck > 60;
  return query select 'PAY-17','payments','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 stuck', v::text,
    'Payments left in processing. Resolve each to completed or failed.';

  select count(*) into v from pg_trigger
  where not tgisinternal and tgname in (
    'trg_validate_order_item_price','trg_recalculate_order_total',
    'orders_normalise_payment_status');
  return query select 'PAY-18','payments','P0',
    case when v >= 3 then 'PASS' else 'FAIL' end, '3 money triggers', v::text,
    'Price validation, total recalculation, and status normalisation.';

  select round(coalesce(sum(c.total_spend),0) - coalesce(sum(t.spend),0), 2) into n
  from public.customers c
  left join (
    select o.customer_phone as phone, sum(o.total) as spend
    from public.v_paid_orders vp join public.orders o on o.id = vp.id
    where o.customer_phone is not null and o.customer_phone <> ''
    group by o.customer_phone
  ) t on t.phone = c.phone_number;
  return query select 'CRM-04','crm','P1',
    case when abs(coalesce(n,0)) < 0.01 then 'PASS' else 'FAIL' end,
    'EUR 0.00 variance', 'EUR ' || coalesce(n,0)::text,
    'customers.total_spend vs actual paid orders. Run the backfill to correct.';

  select count(*) into v from public.products p
  where p.is_visible is true
    and not exists (select 1 from public.product_allergens a
                    where a.product_id = p.id and a.allergen_numbers is not null);
  return query select 'DAT-03','compliance','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 missing', v::text,
    'Visible products with no allergen data. FSAI requires this before purchase.';

  select count(*) into v from public.order_items oi
  where not exists (select 1 from public.orders o where o.id = oi.order_id);
  return query select 'DAT-04','data','P2',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 orphans', v::text,
    'order_items with no parent order.';

  select count(*) into v from public.orders
  where display_id in (1001,1002,1003,1011,1012,1013,1014,1015,1016,1017,1018,1068,1069,1138);
  select count(*) into v2 from public.products
  where lower(name) like '%test%' and is_visible is true;
  return query select 'DAT-07','data','P2',
    case when v + v2 = 0 then 'PASS' else 'FAIL' end, '0 test rows',
    v::text || ' orders, ' || v2::text || ' products',
    'Known test orders and any visible product named "test".';

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

  select count(*) into v from public.v_stock_conflicts;
  return query select 'INV-01','operations','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 conflicts', v::text,
    'Out-of-stock ingredient still default on a visible, available product.';

  select count(*) into v from public.order_feedback f
  where f.responded_at is not null and f.review_link_sent_at is null;
  return query select 'REV-11','compliance','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 ungated', v::text,
    'Rated customers never offered the review link. This is review gating.';

  select count(*) into v from public.orders;
  return query select 'INF-01','info','-','INFO','-', v::text, 'Total orders.';

  select count(*) into v from public.v_review_request_queue;
  return query select 'INF-02','info','-','INFO','-', v::text,
    'Orders currently due a review request.';

  select coalesce(round(avg(rc.ask_rate_pct),1),0) into n from public.v_review_coverage rc;
  return query select 'INF-03','info','-','INFO','-', n::text || '%',
    'Average review ask rate.';

  select count(*) into v from public.v_payment_integrity pi where pi.severity = 'medium';
  return query select 'INF-04','info','-','INFO','-', v::text,
    'Cash orders awaiting till reconciliation.';
end;
$$;
