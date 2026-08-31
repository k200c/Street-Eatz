-- ============================================================================
-- FOOD OS MODULE: REVIEW ENGINE - CAPTURE SIDE
--
-- orders.review_sms_sent/_at/_sid already exist and have been used since Apr
-- 2026 (262 sends). What is missing is anywhere to record the REPLY, so the
-- engine has been one-way: it asks and never listens.
--
-- COMPLIANCE, DESIGNED IN NOT BOLTED ON:
-- Google's Business Profile policy prohibits review gating - selectively
-- soliciting positive reviews or discouraging negative ones. Irish consumer
-- regulations implementing the Omnibus Directive treat suppressing or
-- selectively harvesting reviews as a misleading commercial practice.
--
-- So there is deliberately NO "should_send_link" flag. The review link goes to
-- EVERY respondent. What varies is the copy, and whether Danny is alerted to
-- ring them - resolution, not suppression. A low rating triggers a callback
-- BEFORE the customer decides what to write, which prevents bad reviews far
-- more effectively than hiding the link.
--
-- ROLLBACK: drop table public.order_feedback cascade;
-- ============================================================================

create table if not exists public.order_feedback (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid unique references public.orders(id) on delete cascade,
  customer_phone      text,

  rating              smallint check (rating between 1 and 5),
  comment             text,

  source              text not null default 'sms'
                        check (source in ('sms','web','qr','voice','staff')),

  -- Compliance evidence: when the public review link was sent to THIS person.
  -- Every respondent gets one regardless of rating.
  review_link_sent_at timestamptz,

  -- Operational: low ratings page Danny so he can resolve it the same evening.
  alerted_at          timestamptz,
  resolved_at         timestamptz,
  resolution_note     text,

  requested_at        timestamptz not null default now(),
  responded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.order_feedback is
  'Customer rating per order. The public review link is sent to every respondent regardless of rating - gating is against Google policy and Irish consumer law. Low ratings trigger an operator callback instead.';
comment on column public.order_feedback.review_link_sent_at is
  'Evidence the review link was offered to this customer. Should be populated for every responded row, not only high ratings.';

create index if not exists order_feedback_rating_idx     on public.order_feedback (rating);
create index if not exists order_feedback_responded_idx  on public.order_feedback (responded_at desc);
create index if not exists order_feedback_phone_idx      on public.order_feedback (customer_phone);
create index if not exists order_feedback_unresolved_idx on public.order_feedback (alerted_at)
  where resolved_at is null;

-- Reuse the existing timestamp trigger already used on orders and customers.
drop trigger if exists order_feedback_touch on public.order_feedback;
create trigger order_feedback_touch before update on public.order_feedback
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------- RLS
-- Feedback is customer data. No anon access. Admins read and write; n8n writes
-- via the service role, which bypasses RLS entirely.
alter table public.order_feedback enable row level security;

drop policy if exists order_feedback_admin_all on public.order_feedback;
create policy order_feedback_admin_all on public.order_feedback
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ------------------------------------------------------------------- VIEWS
create or replace view public.v_feedback_summary as
select
  count(*)                                              as requests_sent,
  count(*) filter (where responded_at is not null)      as responses,
  round(100.0 * count(*) filter (where responded_at is not null)
        / nullif(count(*), 0), 1)                       as response_rate_pct,
  round(avg(rating) filter (where rating is not null), 2) as avg_rating,
  count(*) filter (where rating >= 4)                   as promoters,
  count(*) filter (where rating = 3)                    as passives,
  count(*) filter (where rating <= 2)                   as detractors,
  count(*) filter (where rating <= 3 and resolved_at is null and responded_at is not null)
                                                        as unresolved_complaints,
  -- Compliance check: any responded row with no link sent is a gating risk
  count(*) filter (where responded_at is not null and review_link_sent_at is null)
                                                        as responded_without_link
from public.order_feedback;

comment on view public.v_feedback_summary is
  'responded_without_link should always be zero. Non-zero means someone was asked for a rating but never offered the review link, which is review gating.';

create or replace view public.v_feedback_trend as
select
  (responded_at at time zone 'Europe/Dublin')::date as trade_date,
  count(*)                                          as responses,
  round(avg(rating), 2)                             as avg_rating,
  count(*) filter (where rating <= 2)               as detractors
from public.order_feedback
where responded_at is not null and rating is not null
group by 1
order by 1 desc;

-- Which menu items correlate with low scores. Turns feedback into a kitchen
-- action rather than a vanity metric.
create or replace view public.v_feedback_by_item as
select
  oi.product_name,
  count(distinct f.id)                  as rated_orders,
  round(avg(f.rating), 2)               as avg_rating,
  count(*) filter (where f.rating <= 2) as detractor_orders
from public.order_feedback f
join public.order_items oi on oi.order_id = f.order_id
where f.rating is not null
group by oi.product_name
having count(distinct f.id) >= 3
order by avg_rating asc, rated_orders desc;

comment on view public.v_feedback_by_item is
  'Average rating per item, minimum 3 rated orders. Lowest first - the top row is what to fix in the kitchen.';

-- The callback queue: unhappy customers not yet resolved.
create or replace view public.v_feedback_callbacks as
select
  f.id,
  f.order_id,
  o.display_id,
  f.rating,
  f.comment,
  f.responded_at,
  f.alerted_at,
  round(extract(epoch from (now() - f.responded_at)) / 3600.0, 1) as hours_waiting
from public.order_feedback f
join public.orders o on o.id = f.order_id
where f.rating <= 3
  and f.responded_at is not null
  and f.resolved_at is null
order by f.responded_at asc;

comment on view public.v_feedback_callbacks is
  'Unresolved unhappy customers, oldest first. Contains order-identifying data - operator use only, never shipped to the Console.';

-- ------------------------------------------- BACKFILL FROM EXISTING SENDS
-- 262 review requests were already sent. Record them as requests with no
-- response, so response-rate figures are honest from day one rather than
-- starting at a flattering 100%.
insert into public.order_feedback (order_id, customer_phone, source, requested_at)
select o.id, o.customer_phone, 'sms', coalesce(o.review_sms_sent_at, o.created_at)
from public.orders o
where o.review_sms_sent is true
on conflict (order_id) do nothing;
