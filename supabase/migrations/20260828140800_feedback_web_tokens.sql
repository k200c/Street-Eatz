-- ============================================================================
-- REVIEW ENGINE: one-tap web rating links
--
-- WHY NOT SMS REPLIES: the outbound sender is an alphanumeric Sender ID
-- ("Street Eatz"), which is one-way only - recipients cannot reply, and
-- inbound messages are never received by the Twilio project. Ireland's ComReg
-- Sender ID Registry also constrains what can be used as a sender. A tokenised
-- link sidesteps all of it: outbound stays branded, ratings come back over
-- HTTPS, and the same endpoint serves QR and web later.
--
-- SECURITY: the token is the credential. It is single-purpose, expires, and
-- reveals nothing about the customer if guessed - the lookup is by token only,
-- never by phone or order number, so the link cannot be used to enumerate
-- orders (the same defect already fixed in get-order-status).
-- ============================================================================

create table if not exists public.feedback_tokens (
  token       text primary key default encode(gen_random_bytes(16), 'hex'),
  order_id    uuid not null references public.orders(id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '14 days',
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_tokens_order_idx on public.feedback_tokens (order_id);

comment on table public.feedback_tokens is
  'Single-use rating links. The token is the only lookup key - never accept an order id or phone number from the client, or the endpoint becomes an enumeration vector.';

alter table public.feedback_tokens enable row level security;
-- No policies: unreachable via anon/authenticated. Only the service role and
-- the SECURITY DEFINER functions below can touch it.

-- ------------------------------------------------- ISSUE A LINK FOR AN ORDER
create or replace function public.issue_feedback_token(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text;
begin
  -- Reuse an unexpired token rather than issuing a second one for the same
  -- order, so a resend does not create two live links.
  select token into v_token
  from public.feedback_tokens
  where order_id = p_order_id and used_at is null and expires_at > now()
  limit 1;

  if v_token is not null then
    return v_token;
  end if;

  insert into public.feedback_tokens (order_id)
  values (p_order_id)
  returning token into v_token;

  return v_token;
end;
$$;

-- ------------------------------------------------ WHAT THE RATING PAGE SHOWS
-- Deliberately minimal: enough to confirm the customer is rating the right
-- meal, and nothing that would be worth harvesting.
create or replace function public.get_feedback_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order_id uuid;
  v_display  int;
  v_items    text;
begin
  select t.order_id, o.display_id
    into v_order_id, v_display
  from public.feedback_tokens t
  join public.orders o on o.id = t.order_id
  where t.token = p_token
    and t.expires_at > now();

  if v_order_id is null then
    return jsonb_build_object('valid', false);
  end if;

  select string_agg(oi.quantity || 'x ' || oi.product_name, ', ')
    into v_items
  from public.order_items oi
  where oi.order_id = v_order_id;

  return jsonb_build_object(
    'valid',        true,
    'display_id',   v_display,
    'items',        coalesce(v_items, ''),
    'already_rated', exists (
      select 1 from public.order_feedback f
      where f.order_id = v_order_id and f.responded_at is not null
    )
  );
end;
$$;

-- ------------------------------------------------------- SUBMIT A WEB RATING
create or replace function public.submit_feedback_by_token(
  p_token   text,
  p_rating  int,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order_id uuid;
  v_phone    text;
  v_id       uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;

  select t.order_id, o.customer_phone
    into v_order_id, v_phone
  from public.feedback_tokens t
  join public.orders o on o.id = t.order_id
  where t.token = p_token
    and t.expires_at > now();

  if v_order_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  end if;

  insert into public.order_feedback (
    order_id, customer_phone, rating, comment, source,
    responded_at, review_link_sent_at
  )
  values (
    v_order_id, v_phone, p_rating,
    nullif(btrim(coalesce(p_comment, '')), ''), 'web',
    now(), now()
  )
  on conflict (order_id) do update set
    rating              = excluded.rating,
    comment             = coalesce(excluded.comment, order_feedback.comment),
    responded_at        = now(),
    review_link_sent_at = coalesce(order_feedback.review_link_sent_at, now()),
    updated_at          = now()
  returning id into v_id;

  update public.feedback_tokens set used_at = now() where token = p_token;

  -- The review link is returned for EVERY rating. The caller varies the words,
  -- never whether the link appears. Withholding it from low raters is review
  -- gating, which breaches Google policy and Irish consumer protection rules.
  return jsonb_build_object(
    'ok',             true,
    'feedback_id',    v_id,
    'rating',         p_rating,
    'show_review_link', true,
    'needs_callback', p_rating <= 3
  );
end;
$$;

revoke all on function public.issue_feedback_token(uuid)                from public, anon, authenticated;
revoke all on function public.get_feedback_context(text)                from public, anon, authenticated;
revoke all on function public.submit_feedback_by_token(text, int, text) from public, anon, authenticated;
grant execute on function public.issue_feedback_token(uuid)                to service_role;
grant execute on function public.get_feedback_context(text)                to service_role;
grant execute on function public.submit_feedback_by_token(text, int, text) to service_role;
