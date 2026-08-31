-- ============================================================================
-- REVIEW ENGINE: per-order timing, quiet hours, and a mark-sent RPC
--
-- Replaces end-of-day batching with a rolling 75-minute delay after collection.
--
-- WHY 75 MINUTES: truck food is typically eaten within 20 minutes of
-- collection. 75 is long enough that the meal has been finished and judged,
-- short enough that the customer has not mentally moved on.
--
-- WHY QUIET HOURS: an order collected at 21:40 plus 75 minutes is a text at
-- 22:55. Late-night marketing texts generate opt-outs and complaints, not
-- reviews. Anything maturing after 21:00 is held until 09:00 the next morning.
-- Times are Europe/Dublin, so this follows DST automatically.
-- ============================================================================

drop view if exists public.v_review_request_queue;

create view public.v_review_request_queue as
with candidate as (
  select
    o.id            as order_id,
    o.display_id,
    o.customer_name,
    o.customer_phone,
    o.total,
    o.completed_at,
    -- Earliest moment we are willing to send for this order.
    (o.completed_at + interval '75 minutes') as send_after
  from public.orders o
  join public.v_paid_orders p on p.id = o.id
  where o.completed_at is not null
    and o.customer_phone is not null
    and o.customer_phone <> ''
    and coalesce(o.review_sms_sent, false) is false
    and o.completed_at >= now() - interval '7 days'
    and not exists (
      select 1 from public.order_feedback f where f.order_id = o.id
    )
    -- One request per customer per 30 days, however often they order.
    and not exists (
      select 1
      from public.order_feedback f2
      join public.orders o2 on o2.id = f2.order_id
      where right(regexp_replace(coalesce(o2.customer_phone,''), '\D', '', 'g'), 9)
          = right(regexp_replace(o.customer_phone, '\D', '', 'g'), 9)
        and f2.requested_at > now() - interval '30 days'
    )
)
select
  c.order_id,
  c.display_id,
  c.customer_name,
  c.customer_phone,
  c.total,
  c.completed_at,
  c.send_after,
  round(extract(epoch from (now() - c.completed_at)) / 60.0) as minutes_since_collection
from candidate c
where c.send_after <= now()
  and extract(hour from (now() at time zone 'Europe/Dublin')) >= 9
  and extract(hour from (now() at time zone 'Europe/Dublin')) < 21
order by c.completed_at asc;

comment on view public.v_review_request_queue is
  'Orders due a review request right now: paid, collected 75+ min and under 7 days ago, never asked, customer not asked in 30 days, and local time is inside 09:00-21:00. An order maturing during quiet hours appears the next morning.';

-- ------------------------------------------------------------- MARK AS SENT
-- Called AFTER Twilio confirms, so a failed send is retried next run rather
-- than silently skipped. This is the HTTP-200-is-not-success lesson: 262 sends
-- were recorded but only 235 had a message SID, so 27 were marked sent when
-- nothing was ever created.
create or replace function public.mark_review_sent(
  p_order_id uuid,
  p_sid      text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_sid is null or btrim(p_sid) = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_message_sid');
  end if;

  update public.orders
  set review_sms_sent    = true,
      review_sms_sent_at = now(),
      review_sms_sid     = p_sid
  where id = p_order_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  insert into public.order_feedback (order_id, customer_phone, source, requested_at, review_link_sent_at)
  select p_order_id, o.customer_phone, 'sms', now(), now()
  from public.orders o where o.id = p_order_id
  on conflict (order_id) do update set
    review_link_sent_at = coalesce(order_feedback.review_link_sent_at, now()),
    updated_at = now();

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'sid', p_sid);
end;
$$;

revoke all on function public.mark_review_sent(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_review_sent(uuid, text) to service_role;
