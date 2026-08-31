-- ============================================================================
-- FOOD OS: ADMIN-ONLY MANAGEMENT ANALYTICS TOOL
--
-- Production inspection found the reporting views had no security_invoker
-- reloption and remained directly selectable by anon. Move application access
-- behind one role-checked function, then remove direct API access to the views.
-- ============================================================================

create or replace function public.get_management_business_snapshot(
  p_days integer default 14,
  p_meal_period text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_actor uuid := auth.uid();
  v_days integer := greatest(1, least(coalesce(p_days, 14), 90));
  v_meal_period text := lower(coalesce(p_meal_period, 'all'));
  v_end_date date := (now() at time zone 'Europe/Dublin')::date;
  v_start_date date;
  v_previous_start date;
  v_current_revenue numeric := 0;
  v_previous_revenue numeric := 0;
  v_current_orders integer := 0;
  v_daily jsonb;
  v_channels jsonb;
  v_items jsonb;
  v_prep jsonb;
  v_modifier_attach numeric;
  v_health jsonb;
  v_heatmap jsonb;
  v_customers jsonb;
begin
  if v_actor is null
     or not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if v_meal_period not in ('all', 'lunch', 'dinner') then
    raise exception 'Meal period must be all, lunch, or dinner' using errcode = '22023';
  end if;

  v_start_date := v_end_date - (v_days - 1);
  v_previous_start := v_start_date - v_days;

  select
    coalesce(sum(total) filter (where trade_date between v_start_date and v_end_date), 0),
    count(*) filter (where trade_date between v_start_date and v_end_date),
    coalesce(sum(total) filter (where trade_date between v_previous_start and v_start_date - 1), 0)
  into v_current_revenue, v_current_orders, v_previous_revenue
  from public.v_paid_orders
  where v_meal_period = 'all'
    or (v_meal_period = 'lunch' and trade_hour >= 11 and trade_hour < 15)
    or (v_meal_period = 'dinner' and trade_hour >= 17 and trade_hour < 22);

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.trade_date), '[]'::jsonb)
  into v_daily
  from (
    select
      trade_date,
      count(*) as orders,
      round(sum(total), 2) as revenue,
      round(avg(total), 2) as avg_order_value,
      round(max(total), 2) as largest_order,
      count(*) filter (where payment_method = 'cash') as cash_orders,
      count(*) filter (where payment_method <> 'cash') as card_orders
    from public.v_paid_orders
    where trade_date between v_start_date and v_end_date
      and (
        v_meal_period = 'all'
        or (v_meal_period = 'lunch' and trade_hour >= 11 and trade_hour < 15)
        or (v_meal_period = 'dinner' and trade_hour >= 17 and trade_hour < 22)
      )
    group by trade_date
    order by trade_date
  ) rows;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.revenue desc), '[]'::jsonb)
  into v_channels
  from (
    select
      coalesce(nullif(order_channel, ''), 'unknown') as channel,
      count(*) as orders,
      round(sum(total), 2) as revenue,
      round(avg(total), 2) as avg_order_value,
      round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as order_share_pct
    from public.v_paid_orders
    where trade_date between v_start_date and v_end_date
      and (
        v_meal_period = 'all'
        or (v_meal_period = 'lunch' and trade_hour >= 11 and trade_hour < 15)
        or (v_meal_period = 'dinner' and trade_hour >= 17 and trade_hour < 22)
      )
    group by 1
  ) rows;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.units_sold desc, rows.revenue desc), '[]'::jsonb)
  into v_items
  from (
    select
      oi.product_name,
      sum(oi.quantity) as units_sold,
      round(sum(oi.quantity * oi.unit_price), 2) as revenue,
      round(avg(oi.unit_price), 2) as avg_unit_price,
      count(distinct oi.order_id) as appeared_in_orders
    from public.order_items oi
    join public.v_paid_orders paid on paid.id = oi.order_id
    where paid.trade_date between v_start_date and v_end_date
      and (
        v_meal_period = 'all'
        or (v_meal_period = 'lunch' and paid.trade_hour >= 11 and paid.trade_hour < 15)
        or (v_meal_period = 'dinner' and paid.trade_hour >= 17 and paid.trade_hour < 22)
      )
    group by oi.product_name
    order by units_sold desc, revenue desc
    limit 10
  ) rows;

  select case when count(*) = 0 then null else jsonb_build_object(
    'completed_orders', count(*),
    'average', round(avg(extract(epoch from (completed_at - created_at)) / 60.0)::numeric, 1),
    'median', round((percentile_cont(0.5) within group (
      order by extract(epoch from (completed_at - created_at)) / 60.0))::numeric, 1),
    'p90', round((percentile_cont(0.9) within group (
      order by extract(epoch from (completed_at - created_at)) / 60.0))::numeric, 1)
  ) end
  into v_prep
  from public.v_paid_orders
  where trade_date between v_start_date and v_end_date
    and (
      v_meal_period = 'all'
      or (v_meal_period = 'lunch' and trade_hour >= 11 and trade_hour < 15)
      or (v_meal_period = 'dinner' and trade_hour >= 17 and trade_hour < 22)
    )
    and completed_at is not null
    and completed_at > created_at
    and completed_at - created_at < interval '4 hours';

  select round(
    100.0 * count(*) filter (
      where jsonb_typeof(oi.selected_modifiers) = 'object'
        and oi.selected_modifiers <> '{}'::jsonb
    ) / nullif(count(*), 0),
    1
  )
  into v_modifier_attach
  from public.order_items oi
  join public.v_paid_orders paid on paid.id = oi.order_id
  where paid.trade_date between v_start_date and v_end_date
    and (
      v_meal_period = 'all'
      or (v_meal_period = 'lunch' and paid.trade_hour >= 11 and paid.trade_hour < 15)
      or (v_meal_period = 'dinner' and paid.trade_hour >= 17 and paid.trade_hour < 22)
    );

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.issue), '[]'::jsonb)
  into v_health
  from (
    select issue, rows_affected
    from public.v_data_health
  ) rows;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.day, rows.hour), '[]'::jsonb)
  into v_heatmap
  from (
    select
      trade_hour as hour,
      (trade_dow % 7)::integer as day,
      count(*)::integer as count
    from public.v_paid_orders
    where trade_date between v_start_date and v_end_date
      and (
        v_meal_period = 'all'
        or (v_meal_period = 'lunch' and trade_hour >= 11 and trade_hour < 15)
        or (v_meal_period = 'dinner' and trade_hour >= 17 and trade_hour < 22)
      )
    group by trade_hour, trade_dow
  ) rows;

  select jsonb_build_object(
    'total', count(*),
    'returning', count(*) filter (where visit_count > 1),
    'returning_rate_pct', round(
      100.0 * count(*) filter (where visit_count > 1) / nullif(count(*), 0),
      1
    )
  )
  into v_customers
  from public.customers;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'days', v_days,
      'start_date', v_start_date,
      'end_date', v_end_date,
      'timezone', 'Europe/Dublin',
      'revenue_basis', 'verified paid orders',
      'meal_period', v_meal_period
    ),
    'kpis', jsonb_build_object(
      'revenue', round(v_current_revenue, 2),
      'orders', v_current_orders,
      'average_order_value', case when v_current_orders > 0
        then round(v_current_revenue / v_current_orders, 2) else 0 end,
      'previous_period_revenue', round(v_previous_revenue, 2),
      'period_change_pct', case when v_previous_revenue > 0
        then round(100.0 * (v_current_revenue - v_previous_revenue) / v_previous_revenue, 1)
        else 0 end
    ),
    'customers', coalesce(v_customers, '{"total":0,"returning":0,"returning_rate_pct":0}'::jsonb),
    'daily_sales', v_daily,
    'channel_mix', v_channels,
    'item_mix', v_items,
    'prep_time', v_prep,
    'modifier_attach_rate_pct', v_modifier_attach,
    'data_health', v_health,
    'heatmap', v_heatmap
  );
end;
$$;

-- Force all reporting views to obey the invoking database role, then remove
-- direct Data API access. The admin-checked function above is the supported API.
alter view public.v_paid_orders set (security_invoker = true);
alter view public.v_daily_sales set (security_invoker = true);
alter view public.v_trading_rhythm set (security_invoker = true);
alter view public.v_item_mix set (security_invoker = true);
alter view public.v_modifier_attach set (security_invoker = true);
alter view public.v_channel_mix set (security_invoker = true);
alter view public.v_prep_time set (security_invoker = true);
alter view public.v_data_health set (security_invoker = true);

revoke all on public.v_paid_orders from anon, authenticated;
revoke all on public.v_daily_sales from anon, authenticated;
revoke all on public.v_trading_rhythm from anon, authenticated;
revoke all on public.v_item_mix from anon, authenticated;
revoke all on public.v_modifier_attach from anon, authenticated;
revoke all on public.v_channel_mix from anon, authenticated;
revoke all on public.v_prep_time from anon, authenticated;
revoke all on public.v_data_health from anon, authenticated;

revoke all on function public.get_management_business_snapshot(integer, text) from public, anon;
grant execute on function public.get_management_business_snapshot(integer, text) to authenticated;

comment on function public.get_management_business_snapshot(integer, text) is
  'Admin-only FoodOS reporting tool. Returns paid-order KPIs, trends, channels, item mix, prep time, data health and heatmap without exposing underlying views.';
