-- ============================================================================
-- PAYMENT INTEGRITY AUDIT
--
-- Standing checks over money. Every row returned is a discrepancy requiring a
-- human decision - none can be auto-corrected, because the truth lives in
-- Viva, myPOS or Danny's till, not in this database.
--
-- FINDINGS THAT MOTIVATED THIS (26 Aug 2026):
--  - six payment_status vocabularies live: completed, paid, pending, unpaid,
--    failed, processing
--  - orders.status is 'completed' on all 1145 rows, so it carries no
--    information and must never be read as "food was handed over"
--  - 6 card orders hold a Viva transaction ID while still marked pending
--  - 181 cash orders (EUR 4,740) recorded as unpaid or pending
-- ============================================================================

create or replace view public.v_payment_integrity as
select * from (

  -- 1. CRITICAL: Viva processed it, we did not record it. A transaction ID
  --    only exists once Viva has handled the payment.
  select
    'viva_txn_but_not_paid'  as issue,
    1                        as severity_rank,
    'critical'               as severity,
    o.display_id,
    o.total,
    o.payment_status,
    o.payment_method::text   as payment_method,
    o.viva_transaction_id    as reference,
    o.created_at,
    'Check this order code in the Viva dashboard. If captured, the customer paid and the system does not know.' as action
  from public.orders o
  where o.viva_transaction_id is not null
    and lower(coalesce(o.payment_status,'')) not in ('paid','completed')

  union all

  -- 2. Same Viva transaction on more than one order = double charge risk.
  select
    'duplicate_viva_transaction', 1, 'critical',
    o.display_id, o.total, o.payment_status, o.payment_method::text,
    o.viva_transaction_id, o.created_at,
    'This Viva transaction is attached to more than one order. Possible double charge.'
  from public.orders o
  where o.viva_transaction_id is not null
    and exists (
      select 1 from public.orders o2
      where o2.viva_transaction_id = o.viva_transaction_id and o2.id <> o.id
    )

  union all

  -- 3. Charged amount must equal the sum of what was ordered.
  select
    'total_does_not_match_items', 1, 'critical',
    o.display_id, o.total, o.payment_status, o.payment_method::text,
    null, o.created_at,
    'Order total does not equal the sum of its items. Customer may have been over or under charged.'
  from public.orders o
  join (
    select oi.order_id, sum(oi.quantity * oi.unit_price) as items_total
    from public.order_items oi group by oi.order_id
  ) s on s.order_id = o.id
  where abs(o.total - s.items_total) > 0.01
    and lower(coalesce(o.payment_status,'')) in ('paid','completed')

  union all

  -- 4. Card marked paid with no provider reference - unreconcilable against
  --    a settlement report, so it cannot be proven either way.
  select
    'card_paid_without_reference', 2, 'high',
    o.display_id, o.total, o.payment_status, o.payment_method::text,
    null, o.created_at,
    'Card order marked paid with no Viva reference. Unreconcilable against settlement.'
  from public.orders o
  where o.payment_method::text = 'card'
    and lower(coalesce(o.payment_status,'')) in ('paid','completed')
    and o.viva_transaction_id is null

  union all

  -- 5. Payment failed, order completed anyway.
  select
    'failed_payment_order_completed', 2, 'high',
    o.display_id, o.total, o.payment_status, o.payment_method::text,
    o.viva_transaction_id, o.created_at,
    'Payment failed but the order was completed. Was food handed over unpaid?'
  from public.orders o
  where lower(coalesce(o.payment_status,'')) = 'failed'
    and o.completed_at is not null

  union all

  -- 6. Stuck mid-flow: neither succeeded nor failed, so nobody will look.
  select
    'stuck_processing', 2, 'high',
    o.display_id, o.total, o.payment_status, o.payment_method::text,
    o.viva_transaction_id, o.created_at,
    'Payment left in processing. Resolve to paid or failed.'
  from public.orders o
  where lower(coalesce(o.payment_status,'')) = 'processing'
    and o.created_at < now() - interval '1 hour'

  union all

  -- 7. Cash taken but never recorded as paid. Two vocabularies, one situation.
  select
    'cash_not_reconciled', 3, 'medium',
    o.display_id, o.total, o.payment_status, o.payment_method::text,
    null, o.created_at,
    'Cash order not marked paid. Reconcile against the till before writing off.'
  from public.orders o
  where o.payment_method::text = 'cash'
    and lower(coalesce(o.payment_status,'')) in ('unpaid','pending')
    and o.completed_at is not null

) findings
order by severity_rank, created_at desc;

comment on view public.v_payment_integrity is
  'Standing money audit. Every row needs a human decision - the truth lives in Viva, myPOS or the till, never here. Wire the critical and high counts into the QA suite and the daily alert.';

create or replace view public.v_payment_integrity_summary as
select issue, severity, count(*) as occurrences, round(sum(total), 2) as value
from public.v_payment_integrity
group by issue, severity, severity_rank
order by severity_rank, occurrences desc;
