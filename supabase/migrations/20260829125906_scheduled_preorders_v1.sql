-- FOOD OS MODULE: SCHEDULED PRE-ORDERS V1
-- Safe launch posture: disabled by default until the kitchen release workflow
-- has been connected and verified in staging.

alter table public.app_settings
  add column if not exists preorders_enabled boolean not null default false,
  add column if not exists preorder_min_notice_minutes smallint not null default 60,
  add column if not exists preorder_max_days smallint not null default 14,
  add column if not exists preorder_slot_interval_minutes smallint not null default 15,
  add column if not exists preorder_slot_capacity smallint not null default 8,
  add column if not exists preorder_kitchen_lead_minutes smallint not null default 20,
  add column if not exists preorder_hours jsonb not null default '{"0":{"start":"13:00","end":"19:00"},"4":{"start":"12:00","end":"19:00"},"5":{"start":"12:00","end":"19:00"},"6":{"start":"13:00","end":"19:00"}}'::jsonb;

alter table public.orders
  add column if not exists fulfillment_type text not null default 'asap',
  add column if not exists scheduled_for timestamptz,
  add column if not exists kitchen_release_at timestamptz,
  add column if not exists released_to_kitchen_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_fulfillment_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_fulfillment_type_check
      check (fulfillment_type in ('asap', 'scheduled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_schedule_shape_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_schedule_shape_check
      check (
        (fulfillment_type = 'asap' and scheduled_for is null and kitchen_release_at is null)
        or
        (fulfillment_type = 'scheduled' and scheduled_for is not null and kitchen_release_at is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_preorder_limits_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_preorder_limits_check
      check (
        preorder_min_notice_minutes between 15 and 1440
        and preorder_max_days between 1 and 90
        and preorder_slot_interval_minutes in (5, 10, 15, 20, 30, 60)
        and preorder_slot_capacity between 1 and 100
        and preorder_kitchen_lead_minutes between 5 and 180
      );
  end if;
end $$;

create index if not exists orders_scheduled_release_idx
  on public.orders (kitchen_release_at, scheduled_for)
  where fulfillment_type = 'scheduled'
    and released_to_kitchen_at is null
    and (status is null or status <> 'completed');

create or replace function public.enforce_preorder_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cfg public.app_settings%rowtype;
  slot_count integer;
  slot_minutes integer;
begin
  if new.fulfillment_type = 'asap' then
    new.scheduled_for := null;
    new.kitchen_release_at := null;
    new.released_to_kitchen_at := null;
    return new;
  end if;

  select * into cfg from public.app_settings where id = 1;
  if not found or cfg.preorders_enabled is not true then
    raise exception using errcode = 'check_violation', message = 'Scheduled pre-orders are currently unavailable';
  end if;

  if new.scheduled_for is null then
    raise exception using errcode = 'not_null_violation', message = 'A collection time is required for a scheduled order';
  end if;

  if new.scheduled_for < now() + make_interval(mins => cfg.preorder_min_notice_minutes) then
    raise exception using errcode = 'check_violation', message = 'The selected collection time is too soon';
  end if;

  if new.scheduled_for > now() + make_interval(days => cfg.preorder_max_days) then
    raise exception using errcode = 'check_violation', message = 'The selected collection time is too far ahead';
  end if;

  slot_minutes := (
    extract(hour from new.scheduled_for at time zone 'Europe/Dublin')::integer * 60
    + extract(minute from new.scheduled_for at time zone 'Europe/Dublin')::integer
  );
  if mod(slot_minutes, cfg.preorder_slot_interval_minutes) <> 0 then
    raise exception using errcode = 'check_violation', message = 'The selected collection time is not a valid slot';
  end if;

  -- Serialize bookings for the exact slot so concurrent checkouts cannot exceed capacity.
  perform pg_advisory_xact_lock(hashtextextended(new.scheduled_for::text, 0));

  select count(*) into slot_count
  from public.orders o
  where o.fulfillment_type = 'scheduled'
    and o.scheduled_for = new.scheduled_for
    and o.id <> new.id
    and (o.status is null or o.status <> 'completed');

  if slot_count >= cfg.preorder_slot_capacity then
    raise exception using errcode = 'check_violation', message = 'That collection slot has just filled up';
  end if;

  new.kitchen_release_at := new.scheduled_for - make_interval(mins => cfg.preorder_kitchen_lead_minutes);
  return new;
end;
$$;

drop trigger if exists enforce_preorder_slot_before_write on public.orders;
create trigger enforce_preorder_slot_before_write
before insert or update of fulfillment_type, scheduled_for
on public.orders
for each row execute function public.enforce_preorder_slot();

create or replace view public.v_scheduled_order_release_queue
with (security_invoker = true)
as
select
  o.id as order_id,
  o.display_id,
  o.scheduled_for,
  o.kitchen_release_at,
  o.customer_name,
  o.customer_phone,
  o.total,
  o.payment_method,
  o.payment_status,
  o.order_channel
from public.orders o
where o.fulfillment_type = 'scheduled'
  and o.released_to_kitchen_at is null
  and o.kitchen_release_at <= now()
  and (o.status is null or o.status <> 'completed')
  and (
    o.payment_method <> 'card'
    or lower(coalesce(o.payment_status, '')) in ('paid', 'completed')
  );

revoke all on public.v_scheduled_order_release_queue from public, anon, authenticated;
grant select on public.v_scheduled_order_release_queue to service_role;

comment on column public.app_settings.preorders_enabled is
  'Feature gate. Keep false until the scheduled kitchen-release automation is production verified.';
comment on column public.orders.kitchen_release_at is
  'Time at which the release workflow may send this scheduled order to kitchen printing/KDS.';
comment on view public.v_scheduled_order_release_queue is
  'Service-role-only queue of paid or pay-on-collection scheduled orders due for canonical kitchen dispatch.';
