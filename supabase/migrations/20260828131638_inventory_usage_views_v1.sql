-- ============================================================================
-- FOOD OS MODULE: INVENTORY v1 (PORTION USAGE)
--
-- SCOPE, STATED HONESTLY: product_ingredients has no quantity column. It models
-- CUSTOMISATION (default / removable / addable), not a recipe. So this module
-- measures PORTIONS - how many times an ingredient went out on a plate - not
-- weights. Portions are what you build par levels and prep lists from; weights
-- need a quantity column and a unit of measure, which is a later migration.
--
-- Gross, not net: removals live inside order_items.selected_modifiers, whose
-- shape differs across the five checkout paths. Netting them off would be
-- guesswork until those payloads are normalised. Numbers here are therefore an
-- upper bound, and deliberately so - over-ordering stock is a cheaper error
-- than running out mid-service.
--
-- Read-only. No writes, nothing on the ordering path.
-- ROLLBACK: drop view public.<name> cascade;
-- ============================================================================

-- ------------------------------------------------------- PORTION USAGE BY DAY
create or replace view public.v_ingredient_usage_daily as
select
  p.trade_date,
  i.name                as ingredient,
  i.ingredient_type,
  sum(oi.quantity)      as portions_used,
  count(distinct oi.order_id) as orders_containing
from public.order_items oi
join public.v_paid_orders p         on p.id = oi.order_id
join public.product_ingredients pi  on pi.product_id = oi.product_id and pi.is_default
join public.ingredients i           on i.id = pi.ingredient_id
group by p.trade_date, i.name, i.ingredient_type
order by p.trade_date desc, portions_used desc;

comment on view public.v_ingredient_usage_daily is
  'Gross portions of each ingredient sent out per trading day. Upper bound - does not subtract customer removals. Basis for par levels and prep lists.';

-- ------------------------------------------------------------ PAR LEVEL HELP
-- What a normal trading day looks like per ingredient, so Danny can order
-- stock against evidence instead of memory.
create or replace view public.v_ingredient_par_levels as
select
  ingredient,
  ingredient_type,
  count(*)                                   as trading_days,
  round(avg(portions_used), 1)               as avg_per_day,
  max(portions_used)                         as busiest_day,
  round((percentile_cont(0.9) within group (order by portions_used))::numeric, 1) as p90_per_day
from public.v_ingredient_usage_daily
group by ingredient, ingredient_type
having count(*) >= 3
order by avg_per_day desc;

comment on view public.v_ingredient_par_levels is
  'Stock guidance. p90_per_day is the sensible par level - covers 9 days in 10 without over-ordering for the one freak day.';

-- ------------------------------------------------ STOCK CONSISTENCY AUDIT
-- ingredients.in_stock is a boolean the kitchen can flip. This checks whether
-- flipping it actually protects anything: an ingredient marked out of stock
-- that is still a DEFAULT component of a visible, available product means the
-- item stays orderable and the kitchen cannot make it as described.
create or replace view public.v_stock_conflicts as
select
  i.name              as out_of_stock_ingredient,
  pr.name             as still_orderable_product,
  pr.price,
  pi.is_removable
from public.ingredients i
join public.product_ingredients pi on pi.ingredient_id = i.id and pi.is_default
join public.products pr            on pr.id = pi.product_id
where i.in_stock is false
  and pr.is_visible is true
  and coalesce(pr.is_available, true) is true
order by i.name, pr.name;

comment on view public.v_stock_conflicts is
  'Every row is a live defect: an out-of-stock ingredient that is still a default part of an orderable product. Should always be empty.';

-- --------------------------------------------------- ADD-ON REVENUE BY ITEM
-- ingredients doubles as the paid add-on catalogue (addon_price). This shows
-- which add-ons are worth promoting - the same money that was leaking before
-- the voice-bot add-on pricing fix.
create or replace view public.v_addon_catalogue as
select
  i.name              as addon,
  i.ingredient_type,
  i.addon_price,
  i.addon_price_kids,
  i.in_stock,
  count(pi.product_id) filter (where pi.is_addable) as addable_to_products
from public.ingredients i
left join public.product_ingredients pi on pi.ingredient_id = i.id
where coalesce(i.addon_price, 0) > 0
group by i.name, i.ingredient_type, i.addon_price, i.addon_price_kids, i.in_stock
order by i.addon_price desc;
