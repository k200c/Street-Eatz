-- ============================================================================
-- PAYMENT GUARDS + CORRECTED AUDIT
--
-- ROOT CAUSE (established 26 Aug 2026 from live data, not inference):
--   Dec-12 Jan   'processing'  9 orders  - Viva flow set processing on
--                              initiation with nothing to resolve it.
--   22 Jan-20 May 'paid'      41 orders  - payment_status written directly,
--                              bypassing the Viva webhook. 14 of them copied
--                              viva_order_code into viva_transaction_id, so
--                              they look referenced but cannot be reconciled.
--   ongoing      'completed' 447 orders  - webhook via confirm-payment, real
--                              reference every time.
--
-- 158 of 159 card orders since 20 May are clean. The defects are already
-- fixed; what is missing is anything preventing their return.
--
-- KEY INSIGHT: viva_transaction_id is written at CHECKOUT INITIATION, not on
-- payment. Its presence is NOT proof of payment. Only a transaction id that
-- DIFFERS from the order code came from the webhook. The first version of this
-- audit got that wrong and raised a false critical alarm on 6 abandoned
-- checkouts.
-- ============================================================================

-- --------------------------------------------------------------- GUARD 1
-- A card order cannot be marked paid without a webhook-issued reference.
-- This makes the Jan-May class of defect impossible rather than merely absent.
-- Deliberately permissive in one direction: cash and terminal lanes are
-- unaffected, and the service role can still correct data deliberately.
create or replace function public.enforce_card_payment_reference()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.payment_method::text = 'card'
     and lower(coalesce(new.payment_status,'')) in ('paid','completed')
     and (
       new.viva_transaction_id is null
       or btrim(new.viva_transaction_id) = ''
       or new.viva_transaction_id = new.viva_order_code   -- checkout code, not a real txn
     )
  then
    raise exception
      'card order % cannot be marked % without a webhook transaction reference (got %)',
      coalesce(new.display_id::text, new.id::text),
      new.payment_status,
      coalesce(new.viva_transaction_id, 'null')
      using errcode = '23514',
            hint = 'Card payments must be confirmed by the provider webhook via confirm-payment, never written directly from a client.';
  end if;
  return new;
end;
$$;

comment on function public.enforce_card_payment_reference() is
  'Blocks the Jan-May 2026 defect class: card orders marked paid without provider confirmation. A transaction id equal to the order code is the checkout code, not a payment.';

drop trigger if exists orders_enforce_card_reference on public.orders;
create trigger orders_enforce_card_reference
  before insert or update of payment_status, viva_transaction_id on public.orders
  for each row
  execute function public.enforce_card_payment_reference();

-- --------------------------------------------------------------- GUARD 2
-- One vocabulary going forward. 'paid' normalises to 'completed' on write, so
-- the split cannot reopen. Historical rows are left alone - they are evidence.
create or replace function public.normalise_payment_status()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if lower(coalesce(new.payment_status,'')) = 'paid' then
    new.payment_status := 'completed';
  end if;
  return new;
end;
$$;

comment on function public.normalise_payment_status() is
  'Collapses paid -> completed on write. The two words were fingerprints of two different writers; one writer now means one word.';

drop trigger if exists orders_normalise_payment_status on public.orders;
create trigger orders_normalise_payment_status
  before insert or update of payment_status on public.orders
  for each row
  execute function public.normalise_payment_status();

-- --------------------------------------------------------------- GUARD 3
-- Nothing may sit in 'processing' indefinitely. Surfaced, not auto-resolved -
-- only the provider knows the truth.
create or replace view public.v_payments_stuck as
select display_id, total, payment_status, viva_order_code, created_at,
       round(extract(epoch from (now() - created_at))/60.0) as minutes_stuck
from public.orders
where lower(coalesce(payment_status,'')) = 'processing'
  and created_at < now() - interval '30 minutes'
order by created_at;

-- ------------------------------------------------------- CORRECTED AUDIT
create or replace view public.v_payment_integrity as
select * from (

  -- CRITICAL: the same webhook transaction attached to two orders.
  select
    'duplicate_viva_transaction' as issue, 1 as severity_rank, 'critical' as severity,
    o.display_id, o.total, o.payment_status, o.payment_method::text as payment_method,
    o.viva_transaction_id as reference, o.created_at,
    'One Viva transaction on more than one order. Possible double charge.' as action
  from public.orders o
  where o.viva_transaction_id is not null
    and o.viva_transaction_id is distinct from o.viva_order_code
    and exists (select 1 from public.orders o2
                where o2.viva_transaction_id = o.viva_transaction_id and o2.id <> o.id)

  union all

  -- CRITICAL: charged amount does not equal what was ordered.
  select
    'total_does_not_match_items', 1, 'critical',
    o.display_id, o.total, o.payment_status, o.payment_method::text, null, o.created_at,
    'Order total does not equal the sum of its items. Over or under charged.'
  from public.orders o
  join (select oi.order_id, sum(oi.quantity * oi.unit_price) as items_total
        from public.order_items oi group by oi.order_id) s on s.order_id = o.id
  where abs(o.total - s.items_total) > 0.01
    and lower(coalesce(o.payment_status,'')) in ('paid','completed')

  union all

  -- HIGH: marked paid without a webhook-issued reference. Unreconcilable.
  -- Now blocked at write time by GUARD 1; anything appearing here is legacy.
  select
    'card_paid_without_webhook_reference', 2, 'high',
    o.display_id, o.total, o.payment_status, o.payment_method::text,
    o.viva_transaction_id, o.created_at,
    'Card marked paid with no webhook reference (null, or equal to the order code). Cannot be reconciled against settlement.'
  from public.orders o
  where o.payment_method::text = 'card'
    and lower(coalesce(o.payment_status,'')) in ('paid','completed')
    and (o.viva_transaction_id is null or o.viva_transaction_id = o.viva_order_code)

  union all

  -- HIGH: stuck mid-flow. Neither succeeded nor failed.
  select
    'stuck_processing', 2, 'high',
    o.display_id, o.total, o.payment_status, o.payment_method::text,
    o.viva_transaction_id, o.created_at,
    'Payment left in processing. Resolve to completed or failed.'
  from public.orders o
  where lower(coalesce(o.payment_status,'')) = 'processing'
    and o.created_at < now() - interval '1 hour'

  union all

  -- MEDIUM: cash handed over, never reconciled against the till.
  select
    'cash_not_reconciled', 3, 'medium',
    o.display_id, o.total, o.payment_status, o.payment_method::text, null, o.created_at,
    'Cash order not marked paid. Reconcile against the till.'
  from public.orders o
  where o.payment_method::text = 'cash'
    and lower(coalesce(o.payment_status,'')) in ('unpaid','pending')
    and o.completed_at is not null

) findings
order by severity_rank, created_at desc;

comment on view public.v_payment_integrity is
  'Money audit. A viva_transaction_id EQUAL to viva_order_code is the checkout code, not a payment - only a differing value came from the webhook. Getting that wrong produced a false critical alarm on 6 abandoned checkouts.';
