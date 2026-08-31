-- ============================================================================
-- FOOD OS MODULE: BUSINESS INTELLIGENCE v1
--
-- Read-only views over data that already exists. No new tables, no writes,
-- nothing on the ordering path. Safe to drop at any time.
--
-- DESIGN NOTE FOR EXTRACTION: every view aggregates only. No customer names,
-- no phone numbers, no per-person history. That is deliberate - these are
-- exactly the shapes the KCAI Console is allowed to read across clients under
-- the "aggregate at the client, ship only the aggregate" rule.
--
-- Paid orders are defined ONCE here, matching isOrderPaid() in the frontend:
-- 'paid' and 'completed' both mean paid. Do not re-implement that logic.
--
-- ROLLBACK: drop view public.<name> cascade;  (for each below)
-- ============================================================================

-- Which orders count as real revenue. One definition, used everywhere.
create or replace view public.v_paid_orders as
select
  o.id,
  o.display_id,
  o.total,
  o.payment_method::text  as payment_method,
  o.payment_status,
  o.order_channel,
  o.status::text          as status,
  o.created_at,
  o.completed_at,
  (o.created_at at time zone 'Europe/Dublin')::date as trade_date,
  extract(hour from (o.created_at at time zone 'Europe/Dublin'))::int as trade_hour,
  extract(isodow from (o.created_at at time zone 'Europe/Dublin'))::int as trade_dow
from public.orders o
where lower(coalesce(o.payment_status,'')) in ('paid','completed');

comment on view public.v_paid_orders is
  'Base view. Paid = payment_status in (paid, completed), matching isOrderPaid(). Times bucketed in Europe/Dublin, not UTC.';

-- ---------------------------------------------------------------- DAILY SALES
create or replace view public.v_daily_sales as
select
  trade_date,
  count(*)                                    as orders,
  round(sum(total), 2)                        as revenue,
  round(avg(total), 2)                        as avg_order_value,
  round(max(total), 2)                        as largest_order,
  count(*) filter (where payment_method = 'cash')  as cash_orders,
  count(*) filter (where payment_method <> 'cash') as card_orders
from public.v_paid_orders
group by trade_date
order by trade_date desc;

-- ------------------------------------------------------------- TRADING RHYTHM
-- Which hours actually need staff, and which day is worth opening.
create or replace view public.v_trading_rhythm as
select
  trade_dow,
  to_char(date '2024-01-01' + (trade_dow - 1), 'Day') as day_name,
  trade_hour,
  count(*)             as orders,
  round(sum(total), 2) as revenue
from public.v_paid_orders
group by trade_dow, trade_hour
order by trade_dow, trade_hour;

-- -------------------------------------------------------------------ITEM MIX
-- What actually sells. Revenue share, not just unit counts.
create or replace view public.v_item_mix as
select
  oi.product_name,
  sum(oi.quantity)                                as units_sold,
  round(sum(oi.quantity * oi.unit_price), 2)      as revenue,
  round(avg(oi.unit_price), 2)                    as avg_unit_price,
  count(distinct oi.order_id)                     as appeared_in_orders,
  round(100.0 * sum(oi.quantity * oi.unit_price)
        / nullif(sum(sum(oi.quantity * oi.unit_price)) over (), 0), 1) as revenue_share_pct
from public.order_items oi
join public.v_paid_orders p on p.id = oi.order_id
group by oi.product_name
order by revenue desc;

-- --------------------------------------------------------- MODIFIER ATTACH
-- Add-ons are the highest-margin line on the menu. This is the view that shows
-- whether upselling is working - the same money that was leaking at EUR 2.50
-- per order before the voice-bot pricing fix.
create or replace view public.v_modifier_attach as
select
  count(*)                                                    as item_lines,
  count(*) filter (where jsonb_typeof(oi.selected_modifiers) = 'object'
                     and oi.selected_modifiers <> '{}'::jsonb) as lines_with_modifiers,
  round(100.0 * count(*) filter (where jsonb_typeof(oi.selected_modifiers) = 'object'
                                   and oi.selected_modifiers <> '{}'::jsonb)
        / nullif(count(*), 0), 1)                             as attach_rate_pct
from public.order_items oi
join public.v_paid_orders p on p.id = oi.order_id;

-- ------------------------------------------------------------ CHANNEL SPLIT
-- Phone vs web vs staff POS. Tells you what the voice bot is actually worth.
create or replace view public.v_channel_mix as
select
  coalesce(nullif(order_channel, ''), 'unknown') as channel,
  count(*)                                       as orders,
  round(sum(total), 2)                           as revenue,
  round(avg(total), 2)                           as avg_order_value,
  round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as order_share_pct
from public.v_paid_orders
group by 1
order by revenue desc nulls last;

-- ------------------------------------------------------- REAL PREP TIME
-- The quoted wait time is a guess. This is what actually happened.
-- Comparing the two is how the quote stops being a guess.
create or replace view public.v_prep_time as
select
  trade_date,
  count(*) filter (where completed_at is not null) as completed_orders,
  round(avg(extract(epoch from (completed_at - created_at)) / 60.0)::numeric, 1) as avg_prep_mins,
  round((percentile_cont(0.5) within group (
          order by extract(epoch from (completed_at - created_at)) / 60.0))::numeric, 1) as median_prep_mins,
  round((percentile_cont(0.9) within group (
          order by extract(epoch from (completed_at - created_at)) / 60.0))::numeric, 1) as p90_prep_mins
from public.v_paid_orders
where completed_at is not null
  and completed_at > created_at
  and completed_at - created_at < interval '4 hours'   -- exclude tickets left open overnight
group by trade_date
order by trade_date desc;

-- -------------------------------------------------------------- DATA HEALTH
-- Not analytics - a standing audit. Any non-zero row here is a defect.
create or replace view public.v_data_health as
select 'orders with no items'      as issue,
       count(*)                    as rows_affected
from public.orders o
where not exists (select 1 from public.order_items oi where oi.order_id = o.id)
union all
select 'paid orders with zero total',
       count(*) from public.v_paid_orders where total <= 0
union all
select 'order_items with no parent order',
       count(*) from public.order_items oi
       where not exists (select 1 from public.orders o where o.id = oi.order_id)
union all
select 'order total does not match item sum',
       count(*) from (
         select o.id
         from public.orders o
         join public.order_items oi on oi.order_id = o.id
         group by o.id, o.total
         having abs(o.total - sum(oi.quantity * oi.unit_price)) > 0.01
       ) mismatched
union all
select 'orders stuck pending over 24h',
       count(*) from public.orders
       where lower(coalesce(payment_status,'')) = 'pending'
         and created_at < now() - interval '24 hours';

comment on view public.v_data_health is
  'Standing audit. Every row should read zero. Non-zero is a defect, not a statistic. Wire into the QA suite as an automated check.';

-- Run every reporting view with the caller's permissions so the existing
-- staff/admin RLS policies on orders, order_items, and customers remain the
-- security boundary. This prevents a customer session from using a view to
-- bypass the underlying row-level policies.
alter view public.v_paid_orders set (security_invoker = true);
alter view public.v_daily_sales set (security_invoker = true);
alter view public.v_trading_rhythm set (security_invoker = true);
alter view public.v_item_mix set (security_invoker = true);
alter view public.v_modifier_attach set (security_invoker = true);
alter view public.v_channel_mix set (security_invoker = true);
alter view public.v_prep_time set (security_invoker = true);
alter view public.v_data_health set (security_invoker = true);
