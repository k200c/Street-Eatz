-- FOOD OS MODULE: KITCHEN / PRINT DISPATCH OUTBOX V1
-- One durable dispatch per order. Browser retries cannot cause duplicate prints.

create table if not exists public.kitchen_dispatches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  payload jsonb not null,
  attempts smallint not null default 0 check (attempts between 0 and 100),
  last_error text,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kitchen_dispatch_retry_idx
  on public.kitchen_dispatches (next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.kitchen_dispatches enable row level security;

create policy "Staff can view kitchen dispatch health"
on public.kitchen_dispatches for select
to authenticated
using (
  public.has_role((select auth.uid()), 'staff'::public.app_role)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

revoke insert, update, delete on public.kitchen_dispatches from anon, authenticated;
grant select, insert, update on public.kitchen_dispatches to service_role;

create or replace view public.v_kitchen_dispatch_retry_queue
with (security_invoker = true)
as
select
  d.id,
  d.order_id,
  d.payload,
  d.attempts,
  d.last_error,
  d.next_attempt_at,
  d.created_at
from public.kitchen_dispatches d
where d.status in ('pending', 'failed')
  and coalesce(d.next_attempt_at, now()) <= now()
  and d.attempts < 10
order by coalesce(d.next_attempt_at, d.created_at), d.created_at;

revoke all on public.v_kitchen_dispatch_retry_queue from public, anon, authenticated;
grant select on public.v_kitchen_dispatch_retry_queue to service_role;

comment on table public.kitchen_dispatches is
  'Idempotent outbox for n8n/PrintNode kitchen delivery. A sent row is proof of accepted handoff; failed rows remain retryable.';
