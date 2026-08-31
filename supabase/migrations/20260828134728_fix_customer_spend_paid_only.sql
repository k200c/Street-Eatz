-- ============================================================================
-- FIX: customers.total_spend and visit_count counted UNPAID orders
--
-- The old trigger was AFTER INSERT on orders and added NEW.total to
-- total_spend with no reference to payment_status. Card orders insert as
-- 'pending', so every abandoned checkout was counted as revenue and as a
-- visit, and nothing ever decremented. Measured on 26 Aug 2026:
--   recorded EUR 13,917.59 vs actual paid EUR 7,115.25  (+96%)
--   recorded 626 visits     vs actual paid 319 visits   (+96%)
--
-- TWO CHANGES:
--  1. Spend and visits now move only on a real paid transition, and move BACK
--     on a refund or reversal. Also handles an amount correction on an order
--     that was already paid.
--  2. The whole thing is wrapped in an exception handler. This trigger fires
--     AFTER INSERT on orders, so previously any error in CRM bookkeeping would
--     roll back the customer's ORDER. Bookkeeping must never be able to do
--     that. It now fails silently and lets the order through.
--
-- 'paid' and 'completed' both mean paid, matching isOrderPaid() and
-- v_paid_orders. One definition, three places, no new vocabulary.
--
-- HISTORICAL DATA IS NOT TOUCHED by this migration. Existing inflated values
-- stay until the backfill is run deliberately - see the runbook.
--
-- ROLLBACK: restore the previous function body from version history and
--   drop trigger if exists on_order_paid_update_customer on public.orders;
--   create trigger on_order_created_update_customer after insert on public.orders
--     for each row execute function public.update_customer_on_order();
-- ============================================================================

create or replace function public.update_customer_on_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_paid    boolean := false;
  v_was_paid   boolean := false;
  v_d_spend    numeric := 0;
  v_d_visits   integer := 0;
begin
  if new.customer_phone is null or new.customer_phone = '' then
    return new;
  end if;

  v_is_paid := lower(coalesce(new.payment_status, '')) in ('paid', 'completed');

  if tg_op = 'UPDATE' then
    v_was_paid := lower(coalesce(old.payment_status, '')) in ('paid', 'completed');
  end if;

  if (not v_was_paid) and v_is_paid then
    -- order just became paid (or inserted already paid, e.g. cash / staff POS)
    v_d_spend  := coalesce(new.total, 0);
    v_d_visits := 1;
  elsif v_was_paid and (not v_is_paid) then
    -- refunded, reversed or corrected back to unpaid
    v_d_spend  := -coalesce(old.total, 0);
    v_d_visits := -1;
  elsif v_was_paid and v_is_paid
        and coalesce(old.total, 0) <> coalesce(new.total, 0) then
    -- amount corrected on an already-paid order; not a new visit
    v_d_spend  := coalesce(new.total, 0) - coalesce(old.total, 0);
    v_d_visits := 0;
  else
    -- unpaid order created, or an update that does not affect money
    return new;
  end if;

  insert into public.customers (
    phone_number, name, total_spend, last_order_date, visit_count
  )
  values (
    new.customer_phone,
    coalesce(new.customer_name, 'Unknown'),
    greatest(v_d_spend, 0),
    case when v_d_visits > 0 then new.created_at else null end,
    greatest(v_d_visits, 0)
  )
  on conflict (phone_number) do update set
    name            = coalesce(excluded.name, customers.name),
    total_spend     = greatest(0, customers.total_spend + v_d_spend),
    visit_count     = greatest(0, customers.visit_count + v_d_visits),
    -- only advance on a real paid order; an abandoned checkout is not a visit
    last_order_date = case
                        when v_d_visits > 0 then new.created_at
                        else customers.last_order_date
                      end,
    updated_at      = now();

  return new;

exception when others then
  -- CRM bookkeeping must never block an order from being created.
  raise warning 'update_customer_on_order failed for order %: %', new.id, sqlerrm;
  return new;
end;
$function$;

comment on function public.update_customer_on_order() is
  'Maintains customers.total_spend / visit_count from PAID orders only. Moves on paid transitions in both directions. Never raises - CRM bookkeeping must not be able to roll back an order insert.';

-- Replace the insert-only trigger with one that also sees payment transitions.
drop trigger if exists on_order_created_update_customer on public.orders;

create trigger on_order_paid_update_customer
  after insert or update of payment_status, total on public.orders
  for each row
  execute function public.update_customer_on_order();
