-- ============================================================================
-- record_feedback(): single entry point for inbound rating replies.
--
-- Keeps the matching rules in the database rather than in an n8n Code node,
-- so they can be tested with SQL and reused by web / QR / voice sources later.
--
-- PHONE MATCHING: orders.customer_phone has been written by several paths over
-- time and is not consistently formatted. Twilio always delivers E.164
-- (+353...). Matching on the last 9 digits handles +353851234567 / 0851234567 /
-- 851234567 as the same person without a data migration.
--
-- COMPLIANCE: review_link_sent_at is stamped for EVERY rating, high or low.
-- The link is never withheld - see the order_feedback table comment.
-- ============================================================================

create or replace function public.record_feedback(
  p_phone   text,
  p_rating  int,
  p_comment text default null,
  p_source  text default 'sms'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order_id    uuid;
  v_display_id  int;
  v_feedback_id uuid;
  v_digits      text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5, got %', p_rating
      using errcode = '22023';
  end if;

  v_digits := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);

  if length(v_digits) < 7 then
    raise exception 'phone number too short to match: %', p_phone
      using errcode = '22023';
  end if;

  -- Most recent order for this caller, however their number was stored.
  select o.id, o.display_id
    into v_order_id, v_display_id
  from public.orders o
  where regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') like '%' || v_digits
  order by o.created_at desc
  limit 1;

  insert into public.order_feedback (
    order_id, customer_phone, rating, comment, source,
    responded_at, review_link_sent_at
  )
  values (
    v_order_id, p_phone, p_rating,
    nullif(btrim(coalesce(p_comment, '')), ''), p_source,
    now(), now()
  )
  on conflict (order_id) do update set
    rating              = excluded.rating,
    comment             = coalesce(excluded.comment, order_feedback.comment),
    responded_at        = now(),
    review_link_sent_at = coalesce(order_feedback.review_link_sent_at, now()),
    updated_at          = now()
  returning id into v_feedback_id;

  return jsonb_build_object(
    'feedback_id',    v_feedback_id,
    'order_id',       v_order_id,
    'display_id',     v_display_id,
    'rating',         p_rating,
    'matched_order',  v_order_id is not null,
    'needs_callback', p_rating <= 3
  );
end;
$$;

comment on function public.record_feedback(text, int, text, text) is
  'Records a customer rating and links it to their most recent order by last-9-digit phone match. Always stamps review_link_sent_at - the review link is offered on every rating, never gated.';

-- SECURITY DEFINER functions are executable by PUBLIC by default. This one
-- writes customer data, so restrict it to the service role (n8n) only.
revoke all on function public.record_feedback(text, int, text, text) from public;
revoke all on function public.record_feedback(text, int, text, text) from anon;
revoke all on function public.record_feedback(text, int, text, text) from authenticated;
grant execute on function public.record_feedback(text, int, text, text) to service_role;
