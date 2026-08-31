-- ============================================================================
-- REVIEW ENGINE: who should be asked, and who must not be
--
-- 262 of 434 completed paid orders were ever asked for a rating - 40% were
-- never asked at all. Coverage is a far bigger lever on the average rating
-- than any filtering could be, and unlike filtering it is entirely legitimate.
--
-- This view is the outbound queue. A scheduled n8n workflow reads it, issues a
-- token per order, and sends the request. The eligibility rules live here so
-- they are testable in SQL and identical across SMS, web and QR.
-- ============================================================================

create or replace view public.v_review_request_queue as
select
  o.id            as order_id,
  o.display_id,
  o.customer_name,
  o.customer_phone,
  o.total,
  o.completed_at,
  round(extract(epoch from (now() - o.completed_at)) / 3600.0, 1) as hours_since_collection
from public.orders o
join public.v_paid_orders p on p.id = o.id
where o.completed_at is not null
  and o.customer_phone is not null
  and o.customer_phone <> ''

  -- Ask once the meal has actually been eaten, not while they are still queuing.
  and o.completed_at <= now() - interval '90 minutes'

  -- Do not chase a stale order; a rating three weeks later is noise.
  and o.completed_at >= now() - interval '7 days'

  -- Never ask twice for the same order.
  and coalesce(o.review_sms_sent, false) is false
  and not exists (
    select 1 from public.order_feedback f where f.order_id = o.id
  )

  -- Frequency cap: one request per customer per 30 days, however many times
  -- they order. A regular being asked after every visit will simply opt out,
  -- and then you lose them as a data source permanently.
  and not exists (
    select 1
    from public.order_feedback f2
    join public.orders o2 on o2.id = f2.order_id
    where right(regexp_replace(coalesce(o2.customer_phone,''), '\D', '', 'g'), 9)
        = right(regexp_replace(o.customer_phone, '\D', '', 'g'), 9)
      and f2.requested_at > now() - interval '30 days'
  )
order by o.completed_at asc;

comment on view public.v_review_request_queue is
  'Orders eligible for a rating request: paid, collected 90 min to 7 days ago, never asked, and the customer not asked within 30 days. Read by the scheduled outbound workflow.';

-- ------------------------------------------------------------- COVERAGE VIEW
-- Standing measure of the actual problem: how many completed orders ever got
-- asked. This is the number to move.
create or replace view public.v_review_coverage as
select
  p.trade_date,
  count(*)                                                        as completed_orders,
  count(*) filter (where o.review_sms_sent is true)                as asked,
  count(f.id) filter (where f.responded_at is not null)            as responded,
  round(100.0 * count(*) filter (where o.review_sms_sent is true)
        / nullif(count(*), 0), 1)                                  as ask_rate_pct,
  round(100.0 * count(f.id) filter (where f.responded_at is not null)
        / nullif(count(*) filter (where o.review_sms_sent is true), 0), 1) as response_rate_pct
from public.v_paid_orders p
join public.orders o on o.id = p.id
left join public.order_feedback f on f.order_id = o.id
where o.completed_at is not null
group by p.trade_date
order by p.trade_date desc;
