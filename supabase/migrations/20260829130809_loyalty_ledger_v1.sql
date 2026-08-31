-- FOOD OS MODULE: LOYALTY LEDGER V1
-- Immutable points events replace the previous UI-only completed-order count.
-- Disabled by default until Danny approves the reward and earn rules.

alter table public.app_settings
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_points_per_order smallint not null default 1,
  add column if not exists loyalty_reward_cost smallint not null default 5,
  add column if not exists loyalty_reward_label text not null default 'Free Fries or a Drink';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_loyalty_rules_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_loyalty_rules_check
      check (
        loyalty_points_per_order between 1 and 20
        and loyalty_reward_cost between 2 and 100
        and char_length(trim(loyalty_reward_label)) between 3 and 100
      );
  end if;
end $$;

create table if not exists public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  event_type text not null check (event_type in ('earn', 'reversal', 'redeem', 'adjust', 'expire')),
  points_delta integer not null check (points_delta <> 0),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (order_id, event_type)
);

create index if not exists loyalty_events_user_created_idx
  on public.loyalty_events (user_id, created_at desc);
create index if not exists loyalty_events_order_idx
  on public.loyalty_events (order_id)
  where order_id is not null;

alter table public.loyalty_events enable row level security;

create policy "Customers can view their own loyalty ledger"
on public.loyalty_events for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Staff can view loyalty ledgers"
on public.loyalty_events for select
to authenticated
using (
  public.has_role((select auth.uid()), 'staff'::public.app_role)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

create policy "Staff can add loyalty events"
on public.loyalty_events for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'staff'::public.app_role)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

create or replace function public.record_paid_order_loyalty()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cfg public.app_settings%rowtype;
  was_paid boolean := false;
  is_paid boolean := false;
  earned_points integer;
begin
  if new.user_id is null then return new; end if;

  select * into cfg from public.app_settings where id = 1;
  if not found or cfg.loyalty_enabled is not true then return new; end if;

  is_paid := lower(coalesce(new.payment_status, '')) in ('paid', 'completed');
  if tg_op = 'UPDATE' then
    was_paid := lower(coalesce(old.payment_status, '')) in ('paid', 'completed');
  end if;

  if is_paid and not was_paid then
    insert into public.loyalty_events (
      user_id, order_id, event_type, points_delta, note
    ) values (
      new.user_id, new.id, 'earn', cfg.loyalty_points_per_order, 'Paid order'
    ) on conflict (order_id, event_type) do nothing;
  elsif was_paid and not is_paid then
    select points_delta into earned_points
    from public.loyalty_events
    where order_id = new.id and event_type = 'earn';

    if earned_points is not null then
      insert into public.loyalty_events (
        user_id, order_id, event_type, points_delta, note
      ) values (
        new.user_id, new.id, 'reversal', -earned_points, 'Payment reversed or refunded'
      ) on conflict (order_id, event_type) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists record_paid_order_loyalty_after_payment on public.orders;
create trigger record_paid_order_loyalty_after_payment
after insert or update of payment_status
on public.orders
for each row execute function public.record_paid_order_loyalty();

create or replace view public.v_loyalty_balances
with (security_invoker = true)
as
select
  e.user_id,
  greatest(coalesce(sum(e.points_delta), 0), 0)::integer as points_balance,
  coalesce(sum(e.points_delta) filter (where e.points_delta > 0), 0)::integer as lifetime_points,
  count(*) filter (where e.event_type = 'redeem')::integer as rewards_redeemed,
  max(e.created_at) as last_activity_at
from public.loyalty_events e
group by e.user_id;

grant select on public.v_loyalty_balances to authenticated;

create or replace function public.redeem_loyalty_reward(
  p_user_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  cfg public.app_settings%rowtype;
  balance integer;
  event_id uuid;
begin
  if not (
    public.has_role((select auth.uid()), 'staff'::public.app_role)
    or public.has_role((select auth.uid()), 'admin'::public.app_role)
  ) then
    raise exception using errcode = 'insufficient_privilege', message = 'Staff access required';
  end if;

  select * into cfg from public.app_settings where id = 1;
  if not found or cfg.loyalty_enabled is not true then
    raise exception using errcode = 'check_violation', message = 'Loyalty is currently disabled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select greatest(coalesce(sum(points_delta), 0), 0)::integer into balance
  from public.loyalty_events where user_id = p_user_id;

  if balance < cfg.loyalty_reward_cost then
    raise exception using errcode = 'check_violation', message = 'Not enough loyalty points';
  end if;

  insert into public.loyalty_events (
    user_id, event_type, points_delta, note, created_by
  ) values (
    p_user_id,
    'redeem',
    -cfg.loyalty_reward_cost,
    coalesce(nullif(trim(p_note), ''), cfg.loyalty_reward_label),
    (select auth.uid())
  ) returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.redeem_loyalty_reward(uuid, text) from public, anon;
grant execute on function public.redeem_loyalty_reward(uuid, text) to authenticated;

comment on table public.loyalty_events is
  'Immutable loyalty points ledger. Never calculate customer rewards from raw order count.';
comment on column public.app_settings.loyalty_enabled is
  'Feature gate. Keep false until earn threshold and reward are approved.';
