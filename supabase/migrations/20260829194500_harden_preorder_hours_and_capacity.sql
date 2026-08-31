-- FOOD OS MODULE: SCHEDULED PRE-ORDERS V1.1
-- Enforce configured Dublin opening windows at the database boundary and stop
-- abandoned card checkouts from reserving slot capacity indefinitely.

create or replace function public.enforce_preorder_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cfg public.app_settings%rowtype;
  slot_count integer;
  slot_minutes integer;
  local_slot timestamp without time zone;
  day_key text;
  day_hours jsonb;
  start_text text;
  end_text text;
  start_minutes integer;
  end_minutes integer;
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
  if new.payment_method is null then
    raise exception using errcode = 'not_null_violation', message = 'A payment method is required for a scheduled order';
  end if;

  if new.scheduled_for < now() + make_interval(mins => cfg.preorder_min_notice_minutes) then
    raise exception using errcode = 'check_violation', message = 'The selected collection time is too soon';
  end if;

  if new.scheduled_for > now() + make_interval(days => cfg.preorder_max_days) then
    raise exception using errcode = 'check_violation', message = 'The selected collection time is too far ahead';
  end if;

  local_slot := new.scheduled_for at time zone 'Europe/Dublin';
  day_key := extract(dow from local_slot)::integer::text;
  day_hours := cfg.preorder_hours -> day_key;

  if day_hours is null or jsonb_typeof(day_hours) <> 'object' then
    raise exception using errcode = 'check_violation', message = 'The business is closed on the selected collection day';
  end if;

  start_text := day_hours ->> 'start';
  end_text := day_hours ->> 'end';
  if start_text is null or end_text is null
     or start_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or end_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = 'check_violation', message = 'Scheduled collection hours are not configured correctly';
  end if;

  start_minutes := split_part(start_text, ':', 1)::integer * 60 + split_part(start_text, ':', 2)::integer;
  end_minutes := split_part(end_text, ':', 1)::integer * 60 + split_part(end_text, ':', 2)::integer;
  slot_minutes := extract(hour from local_slot)::integer * 60 + extract(minute from local_slot)::integer;

  if start_minutes >= end_minutes or slot_minutes < start_minutes or slot_minutes >= end_minutes then
    raise exception using errcode = 'check_violation', message = 'The selected collection time is outside opening hours';
  end if;

  if mod(slot_minutes - start_minutes, cfg.preorder_slot_interval_minutes) <> 0
     or extract(second from local_slot) <> 0 then
    raise exception using errcode = 'check_violation', message = 'The selected collection time is not a valid slot';
  end if;

  -- Serialize bookings for the exact instant so concurrent checkouts cannot
  -- both claim the last place in a slot.
  perform pg_advisory_xact_lock(hashtextextended(new.scheduled_for::text, 0));

  select count(*) into slot_count
  from public.orders o
  where o.fulfillment_type = 'scheduled'
    and o.scheduled_for = new.scheduled_for
    and o.id <> new.id
    and (o.status is null or o.status <> 'completed')
    and (
      o.payment_method <> 'card'
      or lower(coalesce(o.payment_status, '')) in ('paid', 'completed')
      or (
        lower(coalesce(o.payment_status, '')) in ('pending', 'processing')
        and coalesce(o.created_at, now()) >= now() - interval '20 minutes'
      )
    );

  if slot_count >= cfg.preorder_slot_capacity then
    raise exception using errcode = 'check_violation', message = 'That collection slot has just filled up';
  end if;

  new.kitchen_release_at := new.scheduled_for - make_interval(mins => cfg.preorder_kitchen_lead_minutes);
  return new;
end;
$$;

drop trigger if exists enforce_preorder_slot_before_write on public.orders;
create trigger enforce_preorder_slot_before_write
before insert or update of fulfillment_type, scheduled_for, payment_status, payment_method
on public.orders
for each row execute function public.enforce_preorder_slot();

comment on function public.enforce_preorder_slot() is
  'Validates scheduled orders against enabled state, Dublin opening windows, notice/horizon, exact interval, payment method and concurrency-safe capacity.';
