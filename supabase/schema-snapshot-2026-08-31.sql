


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'staff',
    'customer'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'cooking',
    'ready',
    'completed',
    'pending_payment'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'card',
    'cash',
    'split'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."post_platform" AS ENUM (
    'Instagram',
    'SMS'
);


ALTER TYPE "public"."post_platform" OWNER TO "postgres";


CREATE TYPE "public"."post_status" AS ENUM (
    'draft',
    'published'
);


ALTER TYPE "public"."post_status" OWNER TO "postgres";


CREATE TYPE "public"."product_category" AS ENUM (
    'Burgers',
    'Flatbreads',
    'Fries',
    'Drinks',
    'Specials',
    'Sauces',
    'Kids Menu'
);


ALTER TYPE "public"."product_category" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'customer',
    'staff',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_assistant_product_proposal"("p_proposal_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_proposal public.assistant_action_proposals%rowtype;
  v_current public.products%rowtype;
  v_updated public.products%rowtype;
  v_current_state jsonb;
  v_after_state jsonb;
  v_changes jsonb;
begin
  if v_actor is null
     or not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_proposal
  from public.assistant_action_proposals
  where id = p_proposal_id
  for update;

  if not found or v_proposal.actor_id <> v_actor then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;

  if v_proposal.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'This proposal is no longer pending');
  end if;

  if v_proposal.expires_at <= now() then
    update public.assistant_action_proposals
      set status = 'expired'
      where id = v_proposal.id;
    return jsonb_build_object('ok', false, 'error', 'This proposal has expired');
  end if;

  select * into v_current
  from public.products
  where id = v_proposal.target_product_id
  for update;

  if not found then
    update public.assistant_action_proposals
      set status = 'cancelled'
      where id = v_proposal.id;
    return jsonb_build_object('ok', false, 'error', 'The product no longer exists');
  end if;

  v_current_state := jsonb_build_object(
    'id', v_current.id,
    'name', v_current.name,
    'description', v_current.description,
    'price', v_current.price,
    'category', v_current.category,
    'is_available', v_current.is_available,
    'is_sold_out', v_current.is_sold_out,
    'is_visible', v_current.is_visible
  );

  if v_current_state is distinct from v_proposal.before_state then
    update public.assistant_action_proposals
      set status = 'cancelled'
      where id = v_proposal.id;
    insert into public.assistant_action_audit (
      actor_id, proposal_id, action, target_type, target_id,
      before_state, after_state, status
    ) values (
      v_actor, v_proposal.id, 'update_product', 'product', v_current.id,
      v_proposal.before_state, v_current_state, 'rejected_stale'
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'The product changed after this preview. Ask the assistant to prepare a fresh proposal.'
    );
  end if;

  v_changes := v_proposal.requested_changes;

  update public.products
  set
    name = case when v_changes ? 'name' then v_changes->>'name' else name end,
    description = case when v_changes ? 'description'
      then nullif(v_changes->>'description', '') else description end,
    price = case when v_changes ? 'price' then (v_changes->>'price')::numeric else price end,
    category = case when v_changes ? 'category'
      then (v_changes->>'category')::public.product_category else category end,
    is_available = case when v_changes ? 'is_available'
      then (v_changes->>'is_available')::boolean else is_available end,
    is_sold_out = case when v_changes ? 'is_sold_out'
      then (v_changes->>'is_sold_out')::boolean else is_sold_out end,
    is_visible = case when v_changes ? 'is_visible'
      then (v_changes->>'is_visible')::boolean else is_visible end,
    updated_at = now()
  where id = v_current.id
  returning * into v_updated;

  v_after_state := jsonb_build_object(
    'id', v_updated.id,
    'name', v_updated.name,
    'description', v_updated.description,
    'price', v_updated.price,
    'category', v_updated.category,
    'is_available', v_updated.is_available,
    'is_sold_out', v_updated.is_sold_out,
    'is_visible', v_updated.is_visible
  );

  update public.assistant_action_proposals
  set status = 'applied', applied_at = now()
  where id = v_proposal.id;

  insert into public.assistant_action_audit (
    actor_id, proposal_id, action, target_type, target_id,
    before_state, after_state, status
  ) values (
    v_actor, v_proposal.id, 'update_product', 'product', v_updated.id,
    v_proposal.before_state, v_after_state, 'applied'
  );

  return jsonb_build_object(
    'ok', true,
    'product_id', v_updated.id,
    'product_name', v_updated.name,
    'before', v_proposal.before_state,
    'after', v_after_state,
    'applied_at', now()
  );
end;
$$;


ALTER FUNCTION "public"."apply_assistant_product_proposal"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_assistant_setting_proposal"("p_proposal_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_proposal public.assistant_setting_proposals%rowtype;
  v_settings public.app_settings%rowtype;
  v_current jsonb;
  v_after jsonb;
  v_target_name text;
begin
  if v_actor is null
     or not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_proposal
  from public.assistant_setting_proposals
  where id = p_proposal_id
  for update;

  if not found or v_proposal.actor_id <> v_actor then
    raise exception 'Proposal not found' using errcode = 'P0002';
  end if;

  if v_proposal.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'This proposal is no longer pending');
  end if;

  if v_proposal.expires_at <= now() then
    update public.assistant_setting_proposals set status = 'expired'
    where id = v_proposal.id;
    return jsonb_build_object('ok', false, 'error', 'This proposal has expired');
  end if;

  select * into v_settings from public.app_settings where id = 1 for update;
  if not found then
    update public.assistant_setting_proposals set status = 'cancelled'
    where id = v_proposal.id;
    return jsonb_build_object('ok', false, 'error', 'Operating settings no longer exist');
  end if;

  v_current := case v_proposal.setting_key
    when 'current_wait_time' then to_jsonb(v_settings.current_wait_time)
    when 'is_store_open' then to_jsonb(v_settings.is_store_open)
  end;

  if v_current is distinct from v_proposal.before_value then
    update public.assistant_setting_proposals set status = 'cancelled'
    where id = v_proposal.id;
    insert into public.assistant_action_audit (
      actor_id, setting_proposal_id, action, target_type,
      before_state, after_state, status
    ) values (
      v_actor, v_proposal.id, 'update_setting', v_proposal.setting_key,
      jsonb_build_object(v_proposal.setting_key, v_proposal.before_value),
      jsonb_build_object(v_proposal.setting_key, v_current), 'rejected_stale'
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'This setting changed after the preview. Ask the assistant to prepare a fresh proposal.'
    );
  end if;

  if v_proposal.setting_key = 'current_wait_time' then
    update public.app_settings
    set current_wait_time = v_proposal.requested_value #>> '{}'
    where id = 1;
    v_target_name := 'Current wait time';
  else
    update public.app_settings
    set is_store_open = (v_proposal.requested_value #>> '{}')::boolean
    where id = 1;
    v_target_name := 'Store ordering status';
  end if;

  v_after := v_proposal.requested_value;
  update public.assistant_setting_proposals
  set status = 'applied', applied_at = now()
  where id = v_proposal.id;

  insert into public.assistant_action_audit (
    actor_id, setting_proposal_id, action, target_type,
    before_state, after_state, status
  ) values (
    v_actor, v_proposal.id, 'update_setting', v_proposal.setting_key,
    jsonb_build_object(v_proposal.setting_key, v_proposal.before_value),
    jsonb_build_object(v_proposal.setting_key, v_after), 'applied'
  );

  return jsonb_build_object(
    'ok', true,
    'proposal_type', 'setting',
    'setting_key', v_proposal.setting_key,
    'target_name', v_target_name,
    'before', jsonb_build_object(v_proposal.setting_key, v_proposal.before_value),
    'after', jsonb_build_object(v_proposal.setting_key, v_after),
    'applied_at', now()
  );
end;
$$;


ALTER FUNCTION "public"."apply_assistant_setting_proposal"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_staff_role_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Assign admin role to specific email
  IF NEW.email = 'streeteatzwaterford@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_staff_role_on_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_product_allergens"("p_product_name" "text", "p_allergen_numbers" integer[], "p_confirmed_by" "text", "p_source" "text" DEFAULT 'operator'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_product_id uuid;
  v_name       text;
  v_bad        int;
begin
  select id, name into v_product_id, v_name
  from public.products
  where lower(btrim(name)) = lower(btrim(p_product_name))
  limit 1;

  if v_product_id is null then
    return jsonb_build_object('ok', false, 'reason', 'product_not_found', 'name', p_product_name);
  end if;

  if p_confirmed_by is null or btrim(p_confirmed_by) = '' then
    return jsonb_build_object('ok', false, 'reason', 'confirmed_by_required');
  end if;

  -- Reject anything outside the EU 14. A typo that writes 41 instead of 4
  -- would silently declare nothing.
  select min(x) into v_bad
  from unnest(coalesce(p_allergen_numbers, '{}'::int[])) as x
  where x < 1 or x > 14;

  if v_bad is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_allergen_number', 'value', v_bad);
  end if;

  -- An empty array is a valid, meaningful answer: "confirmed, contains none".
  insert into public.product_allergens
    (product_id, allergen_numbers, confirmed_by, confirmed_at, source)
  values
    (v_product_id, coalesce(p_allergen_numbers, '{}'::int[]), p_confirmed_by, now(), p_source)
  on conflict (product_id) do update set
    allergen_numbers = excluded.allergen_numbers,
    confirmed_by     = excluded.confirmed_by,
    confirmed_at     = now(),
    source           = excluded.source,
    updated_at       = now();

  return jsonb_build_object(
    'ok', true,
    'product', v_name,
    'allergens', coalesce(p_allergen_numbers, '{}'::int[]),
    'declares_none', coalesce(array_length(p_allergen_numbers, 1), 0) = 0
  );
end;
$$;


ALTER FUNCTION "public"."confirm_product_allergens"("p_product_name" "text", "p_allergen_numbers" integer[], "p_confirmed_by" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_management_assistant_quota"("p_limit" integer DEFAULT 20, "p_window_seconds" integer DEFAULT 60) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null
     or not public.has_role(v_actor, 'admin'::public.app_role) then
    return false;
  end if;

  p_limit := greatest(1, least(coalesce(p_limit, 20), 60));
  p_window_seconds := greatest(10, least(coalesce(p_window_seconds, 60), 3600));

  -- Serialize quota decisions for this administrator so simultaneous
  -- serverless requests cannot all pass the same pre-insert count.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor::text, 0)
  );

  select count(*) into v_count
  from public.assistant_request_log
  where actor_id = v_actor
    and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.assistant_request_log (actor_id) values (v_actor);

  -- Opportunistic bounded housekeeping. The index makes this inexpensive.
  delete from public.assistant_request_log
  where created_at < now() - interval '7 days';

  return true;
end;
$$;


ALTER FUNCTION "public"."consume_management_assistant_quota"("p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_assistant_product_proposal"("p_product_id" "uuid", "p_changes" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_product public.products%rowtype;
  v_key text;
  v_changes jsonb := '{}'::jsonb;
  v_before jsonb;
  v_proposal public.assistant_action_proposals%rowtype;
  v_price numeric;
  v_text text;
begin
  if v_actor is null
     or not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_changes is null
     or jsonb_typeof(p_changes) <> 'object'
     or p_changes = '{}'::jsonb then
    raise exception 'At least one product change is required' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes)
  loop
    if v_key not in (
      'name', 'description', 'price', 'category',
      'is_available', 'is_sold_out', 'is_visible'
    ) then
      raise exception 'Field % cannot be changed by the assistant', v_key
        using errcode = '22023';
    end if;
  end loop;

  select * into v_product
  from public.products
  where id = p_product_id;

  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if p_changes ? 'name' then
    v_text := trim(p_changes->>'name');
    if v_text = '' or length(v_text) > 120 then
      raise exception 'Product name must be 1 to 120 characters' using errcode = '22023';
    end if;
    v_changes := v_changes || jsonb_build_object('name', v_text);
  end if;

  if p_changes ? 'description' then
    v_text := nullif(trim(p_changes->>'description'), '');
    if length(coalesce(v_text, '')) > 1000 then
      raise exception 'Description cannot exceed 1000 characters' using errcode = '22023';
    end if;
    v_changes := v_changes || jsonb_build_object('description', to_jsonb(v_text));
  end if;

  if p_changes ? 'price' then
    begin
      v_price := round((p_changes->>'price')::numeric, 2);
    exception when others then
      raise exception 'Price must be a number' using errcode = '22023';
    end;
    if v_price <= 0 or v_price > 500 then
      raise exception 'Price must be between EUR 0.01 and EUR 500.00' using errcode = '22023';
    end if;
    v_changes := v_changes || jsonb_build_object('price', v_price);
  end if;

  if p_changes ? 'category' then
    v_text := p_changes->>'category';
    if v_text not in ('Burgers', 'Flatbreads', 'Fries', 'Drinks', 'Specials', 'Sauces', 'Kids Menu') then
      raise exception 'Unknown menu category' using errcode = '22023';
    end if;
    v_changes := v_changes || jsonb_build_object('category', v_text);
  end if;

  foreach v_key in array array['is_available', 'is_sold_out', 'is_visible']
  loop
    if p_changes ? v_key then
      if jsonb_typeof(p_changes->v_key) <> 'boolean' then
        raise exception '% must be true or false', v_key using errcode = '22023';
      end if;
      v_changes := v_changes || jsonb_build_object(v_key, p_changes->v_key);
    end if;
  end loop;

  v_before := jsonb_build_object(
    'id', v_product.id,
    'name', v_product.name,
    'description', v_product.description,
    'price', v_product.price,
    'category', v_product.category,
    'is_available', v_product.is_available,
    'is_sold_out', v_product.is_sold_out,
    'is_visible', v_product.is_visible
  );

  insert into public.assistant_action_proposals (
    actor_id, target_product_id, requested_changes, before_state
  ) values (
    v_actor, p_product_id, v_changes, v_before
  ) returning * into v_proposal;

  return jsonb_build_object(
    'id', v_proposal.id,
    'proposal_type', 'product',
    'product_id', v_product.id,
    'target_name', v_product.name,
    'before', v_before,
    'changes', v_changes,
    'expires_at', v_proposal.expires_at,
    'status', v_proposal.status
  );
end;
$$;


ALTER FUNCTION "public"."create_assistant_product_proposal"("p_product_id" "uuid", "p_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_assistant_setting_proposal"("p_setting_key" "text", "p_value" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_actor uuid := auth.uid();
  v_settings public.app_settings%rowtype;
  v_before jsonb;
  v_requested jsonb;
  v_text text;
  v_minutes integer;
  v_proposal public.assistant_setting_proposals%rowtype;
  v_target_name text;
begin
  if v_actor is null
     or not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_setting_key is null
     or p_setting_key not in ('current_wait_time', 'is_store_open') then
    raise exception 'Unsupported operating setting' using errcode = '22023';
  end if;

  select * into v_settings from public.app_settings where id = 1;
  if not found then
    raise exception 'Operating settings not found' using errcode = 'P0002';
  end if;

  if p_setting_key = 'current_wait_time' then
    if p_value is null or jsonb_typeof(p_value) <> 'string' then
      raise exception 'Wait time must be text such as 35 mins' using errcode = '22023';
    end if;
    v_text := lower(trim(p_value #>> '{}'));
    if v_text !~ '^[1-9][0-9]{0,2}[[:space:]]*(min|mins|minute|minutes)$' then
      raise exception 'Wait time must be between 1 and 180 minutes' using errcode = '22023';
    end if;
    v_minutes := substring(v_text from '^[0-9]{1,3}')::integer;
    if v_minutes > 180 then
      raise exception 'Wait time must be between 1 and 180 minutes' using errcode = '22023';
    end if;
    v_requested := to_jsonb(v_minutes::text || ' mins');
    v_before := to_jsonb(v_settings.current_wait_time);
    v_target_name := 'Current wait time';
  else
    if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'Store-open state must be true or false' using errcode = '22023';
    end if;
    v_requested := p_value;
    v_before := to_jsonb(v_settings.is_store_open);
    v_target_name := 'Store ordering status';
  end if;

  insert into public.assistant_setting_proposals (
    actor_id, setting_key, requested_value, before_value
  ) values (
    v_actor, p_setting_key, v_requested, v_before
  ) returning * into v_proposal;

  return jsonb_build_object(
    'id', v_proposal.id,
    'proposal_type', 'setting',
    'setting_key', v_proposal.setting_key,
    'target_name', v_target_name,
    'before', jsonb_build_object(v_proposal.setting_key, v_before),
    'changes', jsonb_build_object(v_proposal.setting_key, v_requested),
    'expires_at', v_proposal.expires_at,
    'status', v_proposal.status
  );
end;
$_$;


ALTER FUNCTION "public"."create_assistant_setting_proposal"("p_setting_key" "text", "p_value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_card_payment_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.payment_method::text = 'card'
     and lower(coalesce(new.payment_status,'')) in ('paid','completed')
     and (
       new.viva_transaction_id is null
       or btrim(new.viva_transaction_id) = ''
       or new.viva_transaction_id = new.viva_order_code
     )
  then
    -- WARNING, not EXCEPTION. See header. Re-arm after PAY-03.
    raise warning
      'PAYMENT INTEGRITY: card order % marked % without a webhook reference (got %). Surfaced in v_payment_integrity.',
      coalesce(new.display_id::text, new.id::text),
      new.payment_status,
      coalesce(new.viva_transaction_id, 'null');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_card_payment_reference"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."enforce_card_payment_reference"() IS 'Detects card orders marked paid without provider confirmation. WARNING ONLY until test PAY-03 proves the staff POS card lane. Re-arm by changing raise warning to raise exception.';



CREATE OR REPLACE FUNCTION "public"."enforce_pay_on_collection"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  collection_enabled boolean;
BEGIN
  -- Only guard customer-facing collection orders (logged-in customer placing a cash/collection order).
  -- Staff POS orders are inserted with user_id IS NULL and are never blocked here.
  IF NEW.payment_method = 'cash' AND NEW.user_id IS NOT NULL THEN
    SELECT pay_on_collection_enabled INTO collection_enabled
    FROM public.app_settings
    WHERE id = 1;

    IF collection_enabled IS NOT NULL AND collection_enabled = false THEN
      RAISE EXCEPTION 'Pay on Collection is currently disabled'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_pay_on_collection"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_preorder_slot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."enforce_preorder_slot"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."enforce_preorder_slot"() IS 'Validates scheduled orders against enabled state, Dublin opening windows, notice/horizon, exact interval, payment method and concurrency-safe capacity.';



CREATE OR REPLACE FUNCTION "public"."get_feedback_context"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_feedback_context"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_management_business_snapshot"("p_days" integer DEFAULT 14, "p_meal_period" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    SET "statement_timeout" TO '8s'
    AS $$
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


ALTER FUNCTION "public"."get_management_business_snapshot"("p_days" integer, "p_meal_period" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_management_business_snapshot"("p_days" integer, "p_meal_period" "text") IS 'Admin-only FoodOS reporting tool. Returns paid-order KPIs, trends, channels, item mix, prep time, data health and heatmap without exposing underlying views.';



CREATE OR REPLACE FUNCTION "public"."get_user_role"("_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role::text
  from public.user_roles
  where user_id = _user_id
  order by case role::text
             when 'admin' then 1
             when 'staff' then 2
             else 3
           end
  limit 1
$$;


ALTER FUNCTION "public"."get_user_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  normalized_phone TEXT;
BEGIN
  -- Normalize phone to E.164 format
  IF NEW.raw_user_meta_data->>'phone' IS NOT NULL THEN
    normalized_phone := regexp_replace(NEW.raw_user_meta_data->>'phone', '[^0-9+]', '', 'g');
    IF NOT normalized_phone LIKE '+%' THEN
      normalized_phone := '+353' || ltrim(normalized_phone, '0');
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    normalized_phone,
    'customer'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_feedback_token"("p_order_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."issue_feedback_token"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_review_sent"("p_order_id" "uuid", "p_sid" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."mark_review_sent"("p_order_id" "uuid", "p_sid" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalise_payment_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if lower(coalesce(new.payment_status,'')) = 'paid' then
    new.payment_status := 'completed';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."normalise_payment_status"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalise_payment_status"() IS 'Collapses paid -> completed on write. The two words were fingerprints of two different writers; one writer now means one word.';



CREATE OR REPLACE FUNCTION "public"."prevent_assistant_audit_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  raise exception 'Assistant audit records are immutable' using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."prevent_assistant_audit_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_role_self_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and auth.uid() = new.id
     and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception
      'profiles.role cannot be changed by the account holder'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_role_self_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."prevent_role_self_change"() IS 'Blocks self-service privilege escalation through profiles.role. user_roles is the source of truth for roles; profiles.role is legacy and should be dropped once get_user_role() reads user_roles.';



CREATE OR REPLACE FUNCTION "public"."qa_checks"() RETURNS TABLE("check_id" "text", "category" "text", "severity" "text", "status" "text", "expected" "text", "actual" "text", "detail" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v int;
  v2 int;
  n numeric;
begin
  select count(*) into v
  from public.profiles p
  full outer join public.user_roles ur on ur.user_id = p.id
  where coalesce(p.role::text,'~') is distinct from coalesce(ur.role::text,'~');
  return query select 'SEC-03','security','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 mismatches', v::text,
    'profiles.role vs user_roles disagree. user_roles is the source of truth.';

  select count(*) into v
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
  return query select 'SEC-07','security','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 tables without RLS', v::text,
    'A table without RLS is readable by anyone holding the anon key.';

  select count(*) into v
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p
                    where p.schemaname='public' and p.tablename = c.relname);
  return query select 'SEC-08','security','P2',
    case when v = 0 then 'PASS' else 'INFO' end, '0 orphans', v::text,
    'RLS enabled with no policies. Intentional only for service-role-only tables.';

  select count(*) into v from pg_trigger
  where tgname = 'profiles_block_role_self_change' and not tgisinternal;
  return query select 'SEC-11','security','P0',
    case when v = 1 then 'PASS' else 'FAIL' end, 'trigger present', v::text,
    'Without this, any customer can set their own role and read all profiles.';

  select count(*) into v from public.v_payment_integrity pi where pi.severity = 'critical';
  return query select 'PAY-01','payments','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 critical', v::text,
    'Double charges or amount mismatches. Investigate before any deploy.';

  select count(*) into v from public.v_payment_integrity pi
  where pi.severity = 'high' and pi.created_at >= '2026-05-20';
  return query select 'PAY-02','payments','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 new high', v::text,
    'High-severity payment issues created since the last known-good date.';

  select count(*) into v from public.v_payments_stuck s where s.minutes_stuck > 60;
  return query select 'PAY-17','payments','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 stuck', v::text,
    'Payments left in processing. Resolve each to completed or failed.';

  select count(*) into v from pg_trigger
  where not tgisinternal and tgname in (
    'trg_validate_order_item_price','trg_recalculate_order_total',
    'orders_normalise_payment_status');
  return query select 'PAY-18','payments','P0',
    case when v >= 3 then 'PASS' else 'FAIL' end, '3 money triggers', v::text,
    'Price validation, total recalculation, and status normalisation.';

  select round(coalesce(sum(c.total_spend),0) - coalesce(sum(t.spend),0), 2) into n
  from public.customers c
  left join (
    select o.customer_phone as phone, sum(o.total) as spend
    from public.v_paid_orders vp join public.orders o on o.id = vp.id
    where o.customer_phone is not null and o.customer_phone <> ''
    group by o.customer_phone
  ) t on t.phone = c.phone_number;
  return query select 'CRM-04','crm','P1',
    case when abs(coalesce(n,0)) < 0.01 then 'PASS' else 'FAIL' end,
    'EUR 0.00 variance', 'EUR ' || coalesce(n,0)::text,
    'customers.total_spend vs actual paid orders. Run the backfill to correct.';

  select count(*) into v from public.products p
  where p.is_visible is true
    and not exists (select 1 from public.product_allergens a
                    where a.product_id = p.id and a.allergen_numbers is not null);
  return query select 'DAT-03','compliance','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 missing', v::text,
    'Visible products with no allergen data. FSAI requires this before purchase.';

  select count(*) into v from public.order_items oi
  where not exists (select 1 from public.orders o where o.id = oi.order_id);
  return query select 'DAT-04','data','P2',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 orphans', v::text,
    'order_items with no parent order.';

  select count(*) into v from public.orders
  where display_id in (1001,1002,1003,1011,1012,1013,1014,1015,1016,1017,1018,1068,1069,1138);
  select count(*) into v2 from public.products
  where lower(name) like '%test%' and is_visible is true;
  return query select 'DAT-07','data','P2',
    case when v + v2 = 0 then 'PASS' else 'FAIL' end, '0 test rows',
    v::text || ' orders, ' || v2::text || ' products',
    'Known test orders and any visible product named "test".';

  select count(*) into v from (
    select o.id from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where lower(coalesce(o.payment_status,'')) in ('paid','completed')
    group by o.id, o.total
    having abs(o.total - sum(oi.quantity * oi.unit_price)) > 0.01
  ) x;
  return query select 'DAT-08','payments','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 mismatches', v::text,
    'A paid order whose total does not match its items was mis-charged.';

  select count(*) into v from public.v_stock_conflicts;
  return query select 'INV-01','operations','P1',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 conflicts', v::text,
    'Out-of-stock ingredient still default on a visible, available product.';

  select count(*) into v from public.order_feedback f
  where f.responded_at is not null and f.review_link_sent_at is null;
  return query select 'REV-11','compliance','P0',
    case when v = 0 then 'PASS' else 'FAIL' end, '0 ungated', v::text,
    'Rated customers never offered the review link. This is review gating.';

  select count(*) into v from public.orders;
  return query select 'INF-01','info','-','INFO','-', v::text, 'Total orders.';

  select count(*) into v from public.v_review_request_queue;
  return query select 'INF-02','info','-','INFO','-', v::text,
    'Orders currently due a review request.';

  select coalesce(round(avg(rc.ask_rate_pct),1),0) into n from public.v_review_coverage rc;
  return query select 'INF-03','info','-','INFO','-', n::text || '%',
    'Average review ask rate.';

  select count(*) into v from public.v_payment_integrity pi where pi.severity = 'medium';
  return query select 'INF-04','info','-','INFO','-', v::text,
    'Cash orders awaiting till reconciliation.';
end;
$$;


ALTER FUNCTION "public"."qa_checks"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."qa_checks"() IS 'Full database-side QA suite. Run before every deploy and nightly. Any FAIL is a defect. Tenant-agnostic by design - the fleet monitor will call this per client.';



CREATE OR REPLACE FUNCTION "public"."recalculate_order_total"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  computed numeric;
BEGIN
  SELECT COALESCE(SUM(unit_price * quantity), 0)
  INTO computed
  FROM public.order_items
  WHERE order_id = NEW.order_id;

  UPDATE public.orders
  SET total = ROUND(computed, 2)
  WHERE id = NEW.order_id
    AND ABS(COALESCE(total, 0) - ROUND(computed, 2)) > 0.01;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."recalculate_order_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_feedback"("p_phone" "text", "p_rating" integer, "p_comment" "text" DEFAULT NULL::"text", "p_source" "text" DEFAULT 'sms'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."record_feedback"("p_phone" "text", "p_rating" integer, "p_comment" "text", "p_source" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_feedback"("p_phone" "text", "p_rating" integer, "p_comment" "text", "p_source" "text") IS 'Records a customer rating and links it to their most recent order by last-9-digit phone match. Always stamps review_link_sent_at - the review link is offered on every rating, never gated.';



CREATE OR REPLACE FUNCTION "public"."record_paid_order_loyalty"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."record_paid_order_loyalty"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_loyalty_reward"("p_user_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."redeem_loyalty_reward"("p_user_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seo_menu_jsonld"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with allergen_names as (
    select a.product_id,
           string_agg(
             case n
               when 1 then 'Cereals containing gluten' when 2 then 'Crustaceans'
               when 3 then 'Eggs'                      when 4 then 'Fish'
               when 5 then 'Peanuts'                   when 6 then 'Soybeans'
               when 7 then 'Milk'                      when 8 then 'Nuts'
               when 9 then 'Celery'                    when 10 then 'Mustard'
               when 11 then 'Sesame'                   when 12 then 'Sulphites'
               when 13 then 'Lupin'                    when 14 then 'Molluscs'
             end, ', ' order by n) as names
    from public.product_allergens a,
         lateral unnest(a.allergen_numbers) as n
    group by a.product_id
  ),
  items as (
    select
      coalesce(nullif(p.category::text, ''), 'Menu') as section,
      jsonb_strip_nulls(jsonb_build_object(
        '@type',       'MenuItem',
        'name',        p.name,
        'description', nullif(btrim(coalesce(p.description,'')), ''),
        'offers', jsonb_build_object(
          '@type',         'Offer',
          'price',         to_char(p.price, 'FM999999990.00'),
          'priceCurrency', 'EUR',
          'availability',  case when coalesce(p.is_available, true)
                                then 'https://schema.org/InStock'
                                else 'https://schema.org/OutOfStock' end
        ),
        -- schema.org has no first-class allergen property, so declared
        -- allergens go in additionalProperty. Machine-readable allergens are
        -- close to unheard of among Irish independents and win the
        -- "gluten free burger waterford" class of query outright.
        'additionalProperty', case when an.names is not null then
          jsonb_build_array(jsonb_build_object(
            '@type', 'PropertyValue',
            'name',  'Allergens',
            'value', an.names))
        end
      )) as item
    from public.products p
    left join allergen_names an on an.product_id = p.id
    where p.is_visible is true
  )
  select jsonb_build_object(
    '@type',      'Menu',
    'inLanguage', 'en-IE',
    'hasMenuSection',
      coalesce(jsonb_agg(jsonb_build_object(
        '@type',       'MenuSection',
        'name',        section,
        'hasMenuItem', section_items
      ) order by section), '[]'::jsonb)
  )
  from (select section, jsonb_agg(item) as section_items
        from items group by section) s;
$$;


ALTER FUNCTION "public"."seo_menu_jsonld"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seo_opening_hours_jsonld"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_hours jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_day   text;
  v_map   jsonb := '{"monday":"Monday","tuesday":"Tuesday","wednesday":"Wednesday","thursday":"Thursday","friday":"Friday","saturday":"Saturday","sunday":"Sunday"}'::jsonb;
begin
  select opening_hours into v_hours from public.app_settings limit 1;
  if v_hours is null then return v_out; end if;

  for v_day in select jsonb_object_keys(v_hours) loop
    -- A closed day is expressed by omission, which is what schema.org expects.
    if v_hours -> v_day ->> 'open' is not null
       and v_hours -> v_day ->> 'close' is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        '@type',     'OpeningHoursSpecification',
        'dayOfWeek', 'https://schema.org/' || coalesce(v_map ->> v_day, initcap(v_day)),
        'opens',     v_hours -> v_day ->> 'open',
        'closes',    v_hours -> v_day ->> 'close'
      ));
    end if;
  end loop;

  return v_out;
end;
$$;


ALTER FUNCTION "public"."seo_opening_hours_jsonld"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seo_restaurant_jsonld"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  b public.business_profile%rowtype;
  v jsonb;
begin
  select * into b from public.business_profile where id = 1;
  if b.id is null then
    return jsonb_build_object('error','business_profile not configured');
  end if;

  v := jsonb_build_object(
    '@context',   'https://schema.org',
    '@type',      'Restaurant',
    'name',       coalesce(b.legal_name, b.display_name),
    'description', b.description,
    'url',        b.website_url,
    'menu',       b.menu_url,
    'telephone',  b.telephone,
    'email',      b.email,
    'priceRange', b.price_range,
    'currenciesAccepted', 'EUR',
    'paymentAccepted',    'Cash, Credit Card, Debit Card',
    'servesCuisine',      to_jsonb(b.serves_cuisine),
    'acceptsReservations', b.accepts_reservations,
    'address', jsonb_strip_nulls(jsonb_build_object(
      '@type',           'PostalAddress',
      'streetAddress',   b.street_address,
      'addressLocality', b.locality,
      'addressRegion',   b.region,
      'postalCode',      b.postal_code,
      'addressCountry',  b.country
    )),
    'geo', case when b.latitude is not null and b.longitude is not null then
      jsonb_build_object('@type','GeoCoordinates',
                         'latitude', b.latitude, 'longitude', b.longitude) end,
    'sameAs',  to_jsonb(b.social_urls),
    'hasMenu', public.seo_menu_jsonld(),
    'openingHoursSpecification', public.seo_opening_hours_jsonld(),
    'potentialAction', case when b.order_url is not null then
      jsonb_build_object(
        '@type','OrderAction',
        'target', jsonb_build_object(
          '@type','EntryPoint',
          'urlTemplate', b.order_url,
          'actionPlatform', jsonb_build_array(
            'https://schema.org/DesktopWebPlatform',
            'https://schema.org/MobileWebPlatform'))) end
  );

  return jsonb_strip_nulls(v);
end;
$$;


ALTER FUNCTION "public"."seo_restaurant_jsonld"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed')
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_completed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_foodos_module_enabled"("p_module_key" "text", "p_enabled" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_module public.foodos_module_settings%rowtype;
begin
  if not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.foodos_module_settings
  set
    enabled = p_enabled,
    updated_by = (select auth.uid()),
    updated_at = now()
  where module_key = p_module_key
  returning * into v_module;

  if not found then
    raise exception 'Unknown FoodOS module: %', p_module_key using errcode = '22023';
  end if;

  -- Keep customer-facing loyalty behaviour aligned with its Settings visibility switch.
  if p_module_key = 'marketing_loyalty' then
    update public.app_settings
    set loyalty_enabled = p_enabled, updated_at = now()
    where id = 1;
  end if;

  return jsonb_build_object(
    'module_key', v_module.module_key,
    'enabled', v_module.enabled,
    'updated_at', v_module.updated_at
  );
end;
$$;


ALTER FUNCTION "public"."set_foodos_module_enabled"("p_module_key" "text", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_feedback_by_token"("p_token" "text", "p_rating" integer, "p_comment" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."submit_feedback_by_token"("p_token" "text", "p_rating" integer, "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_customer_on_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_is_paid    boolean := false;
  v_was_paid   boolean := false;
  v_d_spend    numeric := 0;
  v_d_visits   integer := 0;
begin
  if new.customer_phone is null or new.customer_phone = '' then
    return new;
  end if;

  v_is_paid := lower(coalesce(new.payment_status, '')) in ('paid', 'completed');

  if tg_op = 'UPDATE' then
    v_was_paid := lower(coalesce(old.payment_status, '')) in ('paid', 'completed');
  end if;

  if (not v_was_paid) and v_is_paid then
    -- order just became paid (or inserted already paid, e.g. cash / staff POS)
    v_d_spend  := coalesce(new.total, 0);
    v_d_visits := 1;
  elsif v_was_paid and (not v_is_paid) then
    -- refunded, reversed or corrected back to unpaid
    v_d_spend  := -coalesce(old.total, 0);
    v_d_visits := -1;
  elsif v_was_paid and v_is_paid
        and coalesce(old.total, 0) <> coalesce(new.total, 0) then
    -- amount corrected on an already-paid order; not a new visit
    v_d_spend  := coalesce(new.total, 0) - coalesce(old.total, 0);
    v_d_visits := 0;
  else
    -- unpaid order created, or an update that does not affect money
    return new;
  end if;

  insert into public.customers (
    phone_number, name, total_spend, last_order_date, visit_count
  )
  values (
    new.customer_phone,
    coalesce(new.customer_name, 'Unknown'),
    greatest(v_d_spend, 0),
    case when v_d_visits > 0 then new.created_at else null end,
    greatest(v_d_visits, 0)
  )
  on conflict (phone_number) do update set
    name            = coalesce(excluded.name, customers.name),
    total_spend     = greatest(0, customers.total_spend + v_d_spend),
    visit_count     = greatest(0, customers.visit_count + v_d_visits),
    -- only advance on a real paid order; an abandoned checkout is not a visit
    last_order_date = case
                        when v_d_visits > 0 then new.created_at
                        else customers.last_order_date
                      end,
    updated_at      = now();

  return new;

exception when others then
  -- CRM bookkeeping must never block an order from being created.
  raise warning 'update_customer_on_order failed for order %: %', new.id, sqlerrm;
  return new;
end;
$$;


ALTER FUNCTION "public"."update_customer_on_order"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_customer_on_order"() IS 'Maintains customers.total_spend / visit_count from PAID orders only. Moves on paid transitions in both directions. Never raises - CRM bookkeeping must not be able to roll back an order insert.';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_order_item_price"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  base_price   numeric;
  modifier_sum numeric;
  minimum      numeric;
BEGIN
  SELECT price INTO base_price
  FROM public.products
  WHERE id = NEW.product_id;

  -- Fail open on a missing product (20 historical rows reference deleted products)
  IF base_price IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sum the DB price of every modifier we can positively identify by name.
  -- Unmatched names contribute nothing, so we never demand payment for a
  -- modifier we cannot price. Mirrors create-voice-order, which resolves
  -- modifier prices from the DB and treats unresolvable add-ons as notes.
  SELECT COALESCE(SUM(m.price_adjustment), 0)
  INTO modifier_sum
  FROM jsonb_array_elements(
         COALESCE(NEW.selected_modifiers->'modifiers', '[]'::jsonb)
       ) AS e
  JOIN public.modifiers m
    ON lower(trim(m.name)) = lower(trim(e->>'name'));

  minimum := base_price + COALESCE(modifier_sum, 0);

  IF NEW.unit_price < minimum - 0.01 THEN
    RAISE EXCEPTION
      'Invalid price for %: submitted %, minimum % (base % + modifiers %)',
      NEW.product_name, NEW.unit_price, minimum, base_price, modifier_sum
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity < 1 OR NEW.quantity > 100 THEN
    RAISE EXCEPTION 'Invalid quantity for %: %', NEW.product_name, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_order_item_price"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "is_store_open" boolean DEFAULT true NOT NULL,
    "current_wait_time" "text" DEFAULT '20 mins'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "marketing_banner_text" "text",
    "marketing_banner_enabled" boolean DEFAULT false,
    "card_payment_provider" "text" DEFAULT 'viva'::"text" NOT NULL,
    "online_payments_enabled" boolean DEFAULT true NOT NULL,
    "pay_on_collection_enabled" boolean DEFAULT true NOT NULL,
    "opening_hours" "jsonb",
    "flatbread_addon_enabled" boolean DEFAULT true NOT NULL,
    "preorders_enabled" boolean DEFAULT false NOT NULL,
    "preorder_min_notice_minutes" smallint DEFAULT 60 NOT NULL,
    "preorder_max_days" smallint DEFAULT 14 NOT NULL,
    "preorder_slot_interval_minutes" smallint DEFAULT 15 NOT NULL,
    "preorder_slot_capacity" smallint DEFAULT 8 NOT NULL,
    "preorder_kitchen_lead_minutes" smallint DEFAULT 20 NOT NULL,
    "preorder_hours" "jsonb" DEFAULT '{"0": {"end": "19:00", "start": "13:00"}, "4": {"end": "19:00", "start": "12:00"}, "5": {"end": "19:00", "start": "12:00"}, "6": {"end": "19:00", "start": "13:00"}}'::"jsonb" NOT NULL,
    "loyalty_enabled" boolean DEFAULT false NOT NULL,
    "loyalty_points_per_order" smallint DEFAULT 1 NOT NULL,
    "loyalty_reward_cost" smallint DEFAULT 5 NOT NULL,
    "loyalty_reward_label" "text" DEFAULT 'Free Fries or a Drink'::"text" NOT NULL,
    "google_review_url" "text",
    CONSTRAINT "app_settings_google_review_url_check" CHECK ((("google_review_url" IS NULL) OR ("google_review_url" ~ '^https://search\.google\.com/local/writereview\?placeid=[A-Za-z0-9_-]+$'::"text") OR ("google_review_url" ~ '^https://g\.page/.+/review/?$'::"text"))),
    CONSTRAINT "app_settings_id_check" CHECK (("id" = 1)),
    CONSTRAINT "app_settings_loyalty_rules_check" CHECK (((("loyalty_points_per_order" >= 1) AND ("loyalty_points_per_order" <= 20)) AND (("loyalty_reward_cost" >= 2) AND ("loyalty_reward_cost" <= 100)) AND (("char_length"(TRIM(BOTH FROM "loyalty_reward_label")) >= 3) AND ("char_length"(TRIM(BOTH FROM "loyalty_reward_label")) <= 100)))),
    CONSTRAINT "app_settings_preorder_limits_check" CHECK (((("preorder_min_notice_minutes" >= 15) AND ("preorder_min_notice_minutes" <= 1440)) AND (("preorder_max_days" >= 1) AND ("preorder_max_days" <= 90)) AND ("preorder_slot_interval_minutes" = ANY (ARRAY[5, 10, 15, 20, 30, 60])) AND (("preorder_slot_capacity" >= 1) AND ("preorder_slot_capacity" <= 100)) AND (("preorder_kitchen_lead_minutes" >= 5) AND ("preorder_kitchen_lead_minutes" <= 180)))),
    CONSTRAINT "card_payment_provider_check" CHECK (("card_payment_provider" = ANY (ARRAY['viva'::"text", 'mypos'::"text"])))
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_settings"."preorders_enabled" IS 'Feature gate. Keep false until the scheduled kitchen-release automation is production verified.';



COMMENT ON COLUMN "public"."app_settings"."loyalty_enabled" IS 'Feature gate. Keep false until earn threshold and reward are approved.';



COMMENT ON COLUMN "public"."app_settings"."google_review_url" IS 'Direct, unfiltered Google review destination configured by an authorised operator.';



CREATE TABLE IF NOT EXISTS "public"."assistant_action_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "proposal_id" "uuid",
    "setting_proposal_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "before_state" "jsonb",
    "after_state" "jsonb",
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assistant_action_audit_status_check" CHECK (("status" = ANY (ARRAY['applied'::"text", 'rejected_stale'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."assistant_action_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistant_action_audit" IS 'Immutable audit log for management-assistant mutations and stale-write rejections.';



CREATE TABLE IF NOT EXISTS "public"."assistant_action_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "target_product_id" "uuid" NOT NULL,
    "requested_changes" "jsonb" NOT NULL,
    "before_state" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    CONSTRAINT "assistant_action_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."assistant_action_proposals" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistant_action_proposals" IS 'Short-lived, admin-owned previews of AI-requested product changes. No proposal is applied without explicit confirmation.';



CREATE TABLE IF NOT EXISTS "public"."assistant_request_log" (
    "id" bigint NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assistant_request_log" OWNER TO "postgres";


ALTER TABLE "public"."assistant_request_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."assistant_request_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."assistant_setting_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "setting_key" "text" NOT NULL,
    "requested_value" "jsonb" NOT NULL,
    "before_value" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    CONSTRAINT "assistant_setting_proposals_setting_key_check" CHECK (("setting_key" = ANY (ARRAY['current_wait_time'::"text", 'is_store_open'::"text"]))),
    CONSTRAINT "assistant_setting_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."assistant_setting_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "image_url" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "open_rate" numeric DEFAULT 0,
    "revenue_generated" numeric DEFAULT 0,
    "recipients_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metrics_verified" boolean DEFAULT false NOT NULL,
    "metrics_source" "text" DEFAULT 'legacy_unverified'::"text" NOT NULL,
    "delivery_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "accepted_recipients" integer DEFAULT 0 NOT NULL,
    "delivered_recipients" integer DEFAULT 0 NOT NULL,
    "failed_recipients" integer DEFAULT 0 NOT NULL,
    "metrics_verified_at" timestamp with time zone,
    CONSTRAINT "broadcasts_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['unknown'::"text", 'queued'::"text", 'accepted'::"text", 'partial'::"text", 'delivered'::"text", 'failed'::"text"]))),
    CONSTRAINT "broadcasts_metrics_source_check" CHECK (("metrics_source" = ANY (ARRAY['legacy_unverified'::"text", 'workflow_ack'::"text", 'twilio_callback'::"text", 'paid_order_attribution'::"text"]))),
    CONSTRAINT "broadcasts_recipient_counts_nonnegative" CHECK ((("accepted_recipients" >= 0) AND ("delivered_recipients" >= 0) AND ("failed_recipients" >= 0))),
    CONSTRAINT "broadcasts_verified_timestamp_check" CHECK (((NOT "metrics_verified") OR ("metrics_verified_at" IS NOT NULL)))
);


ALTER TABLE "public"."broadcasts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."broadcasts"."metrics_verified" IS 'True only after provider delivery evidence and/or paid-order attribution has been processed.';



COMMENT ON COLUMN "public"."broadcasts"."metrics_source" IS 'Provenance for the displayed metric. Legacy rows default to unverified and are hidden from performance totals.';



COMMENT ON COLUMN "public"."broadcasts"."delivery_status" IS 'Aggregate provider delivery state. SMS has delivery status, not an email-style open rate.';



CREATE TABLE IF NOT EXISTS "public"."business_profile" (
    "id" integer DEFAULT 1 NOT NULL,
    "legal_name" "text",
    "display_name" "text",
    "description" "text",
    "street_address" "text",
    "locality" "text",
    "region" "text",
    "postal_code" "text",
    "country" "text" DEFAULT 'IE'::"text",
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "telephone" "text",
    "email" "text",
    "website_url" "text",
    "menu_url" "text",
    "order_url" "text",
    "google_review_url" "text",
    "google_maps_url" "text",
    "price_range" "text",
    "serves_cuisine" "text"[],
    "accepts_reservations" boolean DEFAULT false,
    "social_urls" "text"[],
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_profile_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."business_profile" OWNER TO "postgres";


COMMENT ON TABLE "public"."business_profile" IS 'Single source of truth for Name/Address/Phone and public identity. NAP inconsistency across sources is the commonest reason a business is dropped from AI answers. Leave a field NULL rather than guessing.';



CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "selected_modifiers" "jsonb" DEFAULT '[]'::"jsonb",
    "removed_ingredients" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cart_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "option_a" "text" NOT NULL,
    "option_b" "text" NOT NULL,
    "votes_a" integer DEFAULT 0 NOT NULL,
    "votes_b" integer DEFAULT 0 NOT NULL,
    "closing_date" timestamp with time zone NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "winner" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competitor_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "website_url" "text",
    "google_maps_url" "text",
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "competitor_profiles_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "competitor_profiles_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 1000)))
);


ALTER TABLE "public"."competitor_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competitor_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competitor_id" "uuid" NOT NULL,
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_type" "text" NOT NULL,
    "average_rating" numeric(2,1),
    "review_count" integer,
    "menu_item_count" integer,
    "entry_price" numeric(10,2),
    "average_main_price" numeric(10,2),
    "offer_summary" "text",
    "evidence_url" "text",
    "notes" "text",
    "recorded_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "competitor_snapshots_average_main_price_check" CHECK ((("average_main_price" IS NULL) OR ("average_main_price" >= (0)::numeric))),
    CONSTRAINT "competitor_snapshots_average_rating_check" CHECK ((("average_rating" IS NULL) OR (("average_rating" >= (1)::numeric) AND ("average_rating" <= (5)::numeric)))),
    CONSTRAINT "competitor_snapshots_entry_price_check" CHECK ((("entry_price" IS NULL) OR ("entry_price" >= (0)::numeric))),
    CONSTRAINT "competitor_snapshots_menu_item_count_check" CHECK ((("menu_item_count" IS NULL) OR ("menu_item_count" >= 0))),
    CONSTRAINT "competitor_snapshots_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 1000))),
    CONSTRAINT "competitor_snapshots_offer_summary_check" CHECK ((("offer_summary" IS NULL) OR ("char_length"("offer_summary") <= 1000))),
    CONSTRAINT "competitor_snapshots_review_count_check" CHECK ((("review_count" IS NULL) OR ("review_count" >= 0))),
    CONSTRAINT "competitor_snapshots_source_type_check" CHECK (("source_type" = ANY (ARRAY['google_business'::"text", 'website'::"text", 'menu'::"text", 'social'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."competitor_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "public"."competitor_snapshots" IS 'Time-stamped competitor observations with source evidence; never AI-invented market data.';



CREATE TABLE IF NOT EXISTS "public"."customer_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_phone" "text" NOT NULL,
    "dietary_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "phone_number" "text" NOT NULL,
    "name" "text",
    "total_spend" numeric DEFAULT 0 NOT NULL,
    "last_order_date" timestamp with time zone,
    "visit_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_tokens" (
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(16), 'hex'::"text") NOT NULL,
    "order_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."feedback_tokens" IS 'Single-use rating links. The token is the only lookup key - never accept an order id or phone number from the client, or the endpoint becomes an enumeration vector.';



CREATE TABLE IF NOT EXISTS "public"."food_safety_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "log_type" "text" NOT NULL,
    "checkpoint" "text" NOT NULL,
    "numeric_value" numeric(10,2),
    "unit" "text",
    "status" "text" NOT NULL,
    "corrective_action" "text",
    "notes" "text",
    "recorded_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "food_safety_logs_check" CHECK ((("status" <> 'fail'::"text") OR ("char_length"(TRIM(BOTH FROM COALESCE("corrective_action", ''::"text"))) >= 3))),
    CONSTRAINT "food_safety_logs_checkpoint_check" CHECK ((("char_length"(TRIM(BOTH FROM "checkpoint")) >= 2) AND ("char_length"(TRIM(BOTH FROM "checkpoint")) <= 160))),
    CONSTRAINT "food_safety_logs_corrective_action_check" CHECK ((("corrective_action" IS NULL) OR ("char_length"("corrective_action") <= 1000))),
    CONSTRAINT "food_safety_logs_log_type_check" CHECK (("log_type" = ANY (ARRAY['fridge_temperature'::"text", 'freezer_temperature'::"text", 'cooking_temperature'::"text", 'cooling_temperature'::"text", 'cleaning'::"text", 'opening_check'::"text", 'closing_check'::"text", 'allergen_check'::"text", 'delivery_check'::"text", 'incident'::"text"]))),
    CONSTRAINT "food_safety_logs_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 1000))),
    CONSTRAINT "food_safety_logs_status_check" CHECK (("status" = ANY (ARRAY['pass'::"text", 'fail'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "food_safety_logs_unit_check" CHECK ((("unit" IS NULL) OR ("unit" = ANY (ARRAY['celsius'::"text", 'minutes'::"text", 'boolean'::"text", 'count'::"text"]))))
);


ALTER TABLE "public"."food_safety_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."food_safety_logs" IS 'Immutable HACCP and food-safety evidence. Corrections are recorded as new evidence, not edits.';



CREATE TABLE IF NOT EXISTS "public"."foodos_module_settings" (
    "module_key" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "lifecycle_status" "text" DEFAULT 'mvp'::"text" NOT NULL,
    "display_order" smallint DEFAULT 100 NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "foodos_module_settings_description_check" CHECK ((("char_length"(TRIM(BOTH FROM "description")) >= 3) AND ("char_length"(TRIM(BOTH FROM "description")) <= 240))),
    CONSTRAINT "foodos_module_settings_display_order_check" CHECK ((("display_order" >= 0) AND ("display_order" <= 1000))),
    CONSTRAINT "foodos_module_settings_domain_check" CHECK (("domain" = ANY (ARRAY['marketing'::"text", 'operations'::"text", 'intelligence'::"text", 'customer'::"text", 'finance'::"text"]))),
    CONSTRAINT "foodos_module_settings_label_check" CHECK ((("char_length"(TRIM(BOTH FROM "label")) >= 3) AND ("char_length"(TRIM(BOTH FROM "label")) <= 80))),
    CONSTRAINT "foodos_module_settings_lifecycle_status_check" CHECK (("lifecycle_status" = ANY (ARRAY['live'::"text", 'mvp'::"text", 'connection_required'::"text", 'planned'::"text", 'paused'::"text"]))),
    CONSTRAINT "foodos_module_settings_module_key_check" CHECK (("module_key" ~ '^[a-z][a-z0-9_]{2,63}$'::"text"))
);


ALTER TABLE "public"."foodos_module_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."foodos_module_settings" IS 'Per-client FoodOS module visibility and lifecycle state. No secrets or vendor credentials.';



CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ingredient_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "addon_price" numeric(10,2) DEFAULT 0.50 NOT NULL,
    "addon_price_kids" numeric(10,2) DEFAULT 0.50 NOT NULL,
    "in_stock" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sku" "text",
    "unit" "text" NOT NULL,
    "opening_quantity" numeric(12,3) DEFAULT 0 NOT NULL,
    "reorder_level" numeric(12,3) DEFAULT 0 NOT NULL,
    "par_level" numeric(12,3),
    "unit_cost" numeric(12,4),
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_items_check" CHECK ((("par_level" IS NULL) OR ("par_level" >= "reorder_level"))),
    CONSTRAINT "inventory_items_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "inventory_items_opening_quantity_check" CHECK (("opening_quantity" >= (0)::numeric)),
    CONSTRAINT "inventory_items_reorder_level_check" CHECK (("reorder_level" >= (0)::numeric)),
    CONSTRAINT "inventory_items_unit_check" CHECK (("unit" = ANY (ARRAY['each'::"text", 'g'::"text", 'kg'::"text", 'ml'::"text", 'l'::"text", 'pack'::"text", 'case'::"text"]))),
    CONSTRAINT "inventory_items_unit_cost_check" CHECK ((("unit_cost" IS NULL) OR ("unit_cost" >= (0)::numeric)))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_item_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity_delta" numeric(12,3) NOT NULL,
    "unit_cost" numeric(12,4),
    "order_id" "uuid",
    "note" "text",
    "recorded_by" "uuid" DEFAULT "auth"."uid"(),
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['purchase'::"text", 'usage'::"text", 'waste'::"text", 'count_adjustment'::"text", 'transfer'::"text", 'return'::"text"]))),
    CONSTRAINT "inventory_movements_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 500))),
    CONSTRAINT "inventory_movements_quantity_delta_check" CHECK (("quantity_delta" <> (0)::numeric)),
    CONSTRAINT "inventory_movements_unit_cost_check" CHECK ((("unit_cost" IS NULL) OR ("unit_cost" >= (0)::numeric)))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_movements" IS 'Immutable stock movement ledger; balances derive from opening quantity plus movements.';



CREATE TABLE IF NOT EXISTS "public"."kitchen_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "attempts" smallint DEFAULT 0 NOT NULL,
    "last_error" "text",
    "next_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kitchen_dispatches_attempts_check" CHECK ((("attempts" >= 0) AND ("attempts" <= 100))),
    CONSTRAINT "kitchen_dispatches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."kitchen_dispatches" OWNER TO "postgres";


COMMENT ON TABLE "public"."kitchen_dispatches" IS 'Idempotent outbox for n8n/PrintNode kitchen delivery. A sent row is proof of accepted handoff; failed rows remain retryable.';



CREATE TABLE IF NOT EXISTS "public"."loyalty_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "event_type" "text" NOT NULL,
    "points_delta" integer NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['earn'::"text", 'reversal'::"text", 'redeem'::"text", 'adjust'::"text", 'expire'::"text"]))),
    CONSTRAINT "loyalty_events_points_delta_check" CHECK (("points_delta" <> 0))
);


ALTER TABLE "public"."loyalty_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."loyalty_events" IS 'Immutable loyalty points ledger. Never calculate customer rewards from raw order count.';



CREATE TABLE IF NOT EXISTS "public"."marketing_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "external_campaign_id" "text",
    "campaign_name" "text",
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "metric_name" "text" NOT NULL,
    "metric_value" numeric(18,4) NOT NULL,
    "metric_unit" "text" NOT NULL,
    "provenance" "text" NOT NULL,
    "verified_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_metrics_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "marketing_metrics_metric_name_check" CHECK (("metric_name" ~ '^[a-z][a-z0-9_]{1,63}$'::"text")),
    CONSTRAINT "marketing_metrics_metric_unit_check" CHECK (("metric_unit" = ANY (ARRAY['count'::"text", 'percent'::"text", 'eur'::"text", 'seconds'::"text"]))),
    CONSTRAINT "marketing_metrics_provenance_check" CHECK (("provenance" = ANY (ARRAY['provider_api'::"text", 'provider_webhook'::"text", 'paid_order_attribution'::"text"]))),
    CONSTRAINT "marketing_metrics_provider_check" CHECK (("provider" = ANY (ARRAY['twilio_sms'::"text", 'sendgrid_email'::"text", 'google_ads'::"text", 'meta_ads'::"text", 'google_business'::"text"])))
);


ALTER TABLE "public"."marketing_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."marketing_metrics" IS 'Verified provider or paid-order-attributed marketing facts only. Browser writes are intentionally blocked.';



CREATE TABLE IF NOT EXISTS "public"."marketing_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content" "text" NOT NULL,
    "platform" "public"."post_platform" NOT NULL,
    "status" "public"."post_status" DEFAULT 'draft'::"public"."post_status",
    "image_generated_url" "text",
    "product_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."marketing_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modifier_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "min_selection" integer DEFAULT 0,
    "max_selection" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."modifier_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid",
    "name" "text" NOT NULL,
    "price_adjustment" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "customer_phone" "text",
    "rating" smallint,
    "comment" "text",
    "source" "text" DEFAULT 'sms'::"text" NOT NULL,
    "review_link_sent_at" timestamp with time zone,
    "alerted_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolution_note" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "order_feedback_source_check" CHECK (("source" = ANY (ARRAY['sms'::"text", 'web'::"text", 'qr'::"text", 'voice'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."order_feedback" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_feedback" IS 'Customer rating per order. The public review link is sent to every respondent regardless of rating - gating is against Google policy and Irish consumer law. Low ratings trigger an operator callback instead.';



COMMENT ON COLUMN "public"."order_feedback"."review_link_sent_at" IS 'Evidence the review link was offered to this customer. Should be populated for every responded row, not only high ratings.';



CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "product_id" "uuid",
    "quantity" integer DEFAULT 1,
    "unit_price" numeric(10,2) NOT NULL,
    "selected_modifiers" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "product_name" "text"
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status",
    "payment_method" "public"."payment_method",
    "total" numeric(10,2) NOT NULL,
    "cash_tendered" numeric(10,2),
    "change_due" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "customer_name" "text",
    "customer_phone" "text",
    "viva_order_code" "text",
    "viva_transaction_id" "text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "display_id" integer NOT NULL,
    "special_notes" "text",
    "order_channel" "text" DEFAULT 'web'::"text",
    "completed_at" timestamp with time zone,
    "review_sms_sent" boolean DEFAULT false NOT NULL,
    "review_sms_sent_at" timestamp with time zone,
    "review_sms_sid" "text",
    "fulfillment_type" "text" DEFAULT 'asap'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "kitchen_release_at" timestamp with time zone,
    "released_to_kitchen_at" timestamp with time zone,
    "voice_call_id" "text",
    "is_test" boolean DEFAULT false NOT NULL,
    "test_note" "text",
    CONSTRAINT "orders_fulfillment_type_check" CHECK (("fulfillment_type" = ANY (ARRAY['asap'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "orders_schedule_shape_check" CHECK (((("fulfillment_type" = 'asap'::"text") AND ("scheduled_for" IS NULL) AND ("kitchen_release_at" IS NULL)) OR (("fulfillment_type" = 'scheduled'::"text") AND ("scheduled_for" IS NOT NULL) AND ("kitchen_release_at" IS NOT NULL)))),
    CONSTRAINT "orders_voice_call_id_length_check" CHECK ((("voice_call_id" IS NULL) OR (("char_length"("voice_call_id") >= 8) AND ("char_length"("voice_call_id") <= 200))))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."kitchen_release_at" IS 'Time at which the release workflow may send this scheduled order to kitchen printing/KDS.';



COMMENT ON COLUMN "public"."orders"."voice_call_id" IS 'Provider call identifier used as the idempotency key for voice ordering. Never reuse across calls.';



COMMENT ON COLUMN "public"."orders"."is_test" IS 'Test order, excluded from revenue and analytics. Flagged rather than deleted - it is evidence of what was tested and when.';



CREATE SEQUENCE IF NOT EXISTS "public"."orders_display_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."orders_display_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."orders_display_id_seq" OWNED BY "public"."orders"."display_id";



CREATE TABLE IF NOT EXISTS "public"."payment_ingestion_locks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "transaction_id" "text" NOT NULL,
    "order_code" "text",
    "order_id" "text",
    "branch" "text",
    "retry_count" integer DEFAULT 0,
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_ingestion_locks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_allergens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "allergen_numbers" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "confirmed_by" "text",
    "confirmed_at" timestamp with time zone,
    "source" "text",
    CONSTRAINT "product_allergens_source_check" CHECK ((("source" IS NULL) OR ("source" = ANY (ARRAY['recipe'::"text", 'supplier_label'::"text", 'operator'::"text", 'import'::"text", 'unverified'::"text"]))))
);


ALTER TABLE "public"."product_allergens" OWNER TO "postgres";


COMMENT ON COLUMN "public"."product_allergens"."source" IS 'Where the declaration came from. Never infer from a product name or description.';



CREATE TABLE IF NOT EXISTS "public"."product_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "ingredient_id" "uuid",
    "is_default" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_removable" boolean DEFAULT true NOT NULL,
    "is_addable" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."product_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "group_id" "uuid"
);


ALTER TABLE "public"."product_modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "category" "public"."product_category" NOT NULL,
    "image_url" "text",
    "is_available" boolean DEFAULT true,
    "is_featured" boolean DEFAULT false,
    "stock_count" integer DEFAULT 100,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_sold_out" boolean DEFAULT false,
    "fries_large_price" numeric,
    "is_visible" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "phone" "text",
    "full_name" "text",
    "role" "public"."user_role" DEFAULT 'customer'::"public"."user_role",
    "loyalty_points" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "expiry_date" timestamp with time zone,
    "usage_count" integer DEFAULT 0,
    "max_uses" integer,
    "min_order_value" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "promotions_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'flat'::"text"])))
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roster_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_user_id" "uuid" NOT NULL,
    "shift_start" timestamp with time zone NOT NULL,
    "shift_end" timestamp with time zone NOT NULL,
    "break_minutes" smallint DEFAULT 0 NOT NULL,
    "role_label" "text" DEFAULT 'Team Member'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roster_shifts_break_minutes_check" CHECK ((("break_minutes" >= 0) AND ("break_minutes" <= 240))),
    CONSTRAINT "roster_shifts_check" CHECK (("shift_end" > "shift_start")),
    CONSTRAINT "roster_shifts_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 500))),
    CONSTRAINT "roster_shifts_role_label_check" CHECK ((("char_length"(TRIM(BOTH FROM "role_label")) >= 2) AND ("char_length"(TRIM(BOTH FROM "role_label")) <= 80))),
    CONSTRAINT "roster_shifts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."roster_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_media_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_idea" "text",
    "brief" "text",
    "post_type" "text" NOT NULL,
    "media_urls" "text"[] DEFAULT '{}'::"text"[],
    "scheduled_for" timestamp with time zone,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generated_caption" "text",
    "ai_preference" "text" DEFAULT 'upload_media'::"text",
    "visual_prompt" "text",
    "idea" "text",
    CONSTRAINT "social_media_posts_post_type_check" CHECK (("post_type" = ANY (ARRAY['single'::"text", 'image'::"text", 'carousel'::"text", 'video'::"text", 'reel'::"text"]))),
    CONSTRAINT "social_media_posts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'generating'::"text", 'scheduled'::"text", 'published'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."social_media_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_addon_catalogue" WITH ("security_invoker"='true') AS
 SELECT "i"."name" AS "addon",
    "i"."ingredient_type",
    "i"."addon_price",
    "i"."addon_price_kids",
    "i"."in_stock",
    "count"("pi"."product_id") FILTER (WHERE "pi"."is_addable") AS "addable_to_products"
   FROM ("public"."ingredients" "i"
     LEFT JOIN "public"."product_ingredients" "pi" ON (("pi"."ingredient_id" = "i"."id")))
  WHERE (COALESCE("i"."addon_price", (0)::numeric) > (0)::numeric)
  GROUP BY "i"."name", "i"."ingredient_type", "i"."addon_price", "i"."addon_price_kids", "i"."in_stock"
  ORDER BY "i"."addon_price" DESC;


ALTER VIEW "public"."v_addon_catalogue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_allergen_status" AS
 SELECT "p"."name" AS "product",
    "p"."category",
    "p"."price",
    "p"."is_visible",
        CASE
            WHEN ("a"."product_id" IS NULL) THEN 'MISSING'::"text"
            WHEN ("a"."confirmed_by" IS NULL) THEN 'UNCONFIRMED'::"text"
            WHEN (COALESCE("array_length"("a"."allergen_numbers", 1), 0) = 0) THEN 'CONFIRMED_NONE'::"text"
            ELSE 'CONFIRMED'::"text"
        END AS "status",
    "a"."allergen_numbers",
    "a"."confirmed_by",
    "a"."confirmed_at",
    "a"."source"
   FROM ("public"."products" "p"
     LEFT JOIN "public"."product_allergens" "a" ON (("a"."product_id" = "p"."id")))
  WHERE ("p"."is_visible" IS TRUE)
  ORDER BY
        CASE
            WHEN ("a"."product_id" IS NULL) THEN 1
            WHEN ("a"."confirmed_by" IS NULL) THEN 2
            ELSE 3
        END, "p"."category", "p"."name";


ALTER VIEW "public"."v_allergen_status" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_allergen_status" IS 'Allergen coverage for sellable products. MISSING = nobody has checked. CONFIRMED_NONE = checked and genuinely contains none. Only MISSING is a compliance failure.';



CREATE OR REPLACE VIEW "public"."v_paid_orders" AS
 SELECT "id",
    "display_id",
    "total",
    ("payment_method")::"text" AS "payment_method",
    "payment_status",
    "order_channel",
    ("status")::"text" AS "status",
    "created_at",
    "completed_at",
    (("created_at" AT TIME ZONE 'Europe/Dublin'::"text"))::"date" AS "trade_date",
    (EXTRACT(hour FROM ("created_at" AT TIME ZONE 'Europe/Dublin'::"text")))::integer AS "trade_hour",
    (EXTRACT(isodow FROM ("created_at" AT TIME ZONE 'Europe/Dublin'::"text")))::integer AS "trade_dow"
   FROM "public"."orders" "o"
  WHERE (("lower"(COALESCE("payment_status", ''::"text")) = ANY (ARRAY['paid'::"text", 'completed'::"text"])) AND ("is_test" = false));


ALTER VIEW "public"."v_paid_orders" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_paid_orders" IS 'Base view for all revenue reporting. Paid = payment_status in (paid, completed), matching isOrderPaid(). Excludes test orders. Times bucketed Europe/Dublin.';



CREATE OR REPLACE VIEW "public"."v_channel_mix" WITH ("security_invoker"='true') AS
 SELECT COALESCE(NULLIF("order_channel", ''::"text"), 'unknown'::"text") AS "channel",
    "count"(*) AS "orders",
    "round"("sum"("total"), 2) AS "revenue",
    "round"("avg"("total"), 2) AS "avg_order_value",
    "round"(((100.0 * ("count"(*))::numeric) / NULLIF("sum"("count"(*)) OVER (), (0)::numeric)), 1) AS "order_share_pct"
   FROM "public"."v_paid_orders"
  GROUP BY COALESCE(NULLIF("order_channel", ''::"text"), 'unknown'::"text")
  ORDER BY ("round"("sum"("total"), 2)) DESC NULLS LAST;


ALTER VIEW "public"."v_channel_mix" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_channel_mix_all" AS
 SELECT COALESCE(NULLIF("order_channel", ''::"text"), 'unknown'::"text") AS "channel",
    "count"(*) AS "orders_total",
    "count"(*) FILTER (WHERE ("lower"(COALESCE("payment_status", ''::"text")) = ANY (ARRAY['paid'::"text", 'completed'::"text"]))) AS "orders_reconciled",
    "count"(*) FILTER (WHERE (("lower"(COALESCE("payment_status", ''::"text")) <> ALL (ARRAY['paid'::"text", 'completed'::"text"])) AND ("completed_at" IS NOT NULL))) AS "collected_not_reconciled",
    "round"("sum"("total"), 2) AS "value_total",
    "round"(COALESCE("sum"("total") FILTER (WHERE ("lower"(COALESCE("payment_status", ''::"text")) = ANY (ARRAY['paid'::"text", 'completed'::"text"]))), (0)::numeric), 2) AS "value_reconciled",
    "round"(COALESCE("sum"("total") FILTER (WHERE (("lower"(COALESCE("payment_status", ''::"text")) <> ALL (ARRAY['paid'::"text", 'completed'::"text"])) AND ("completed_at" IS NOT NULL))), (0)::numeric), 2) AS "value_awaiting_reconciliation",
    "round"(((100.0 * ("count"(*) FILTER (WHERE ("lower"(COALESCE("payment_status", ''::"text")) = ANY (ARRAY['paid'::"text", 'completed'::"text"]))))::numeric) / (NULLIF("count"(*), 0))::numeric), 1) AS "reconciled_pct",
    ("min"("created_at"))::"date" AS "first_order",
    ("max"("created_at"))::"date" AS "last_order"
   FROM "public"."orders" "o"
  WHERE ("is_test" = false)
  GROUP BY COALESCE(NULLIF("order_channel", ''::"text"), 'unknown'::"text")
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."v_channel_mix_all" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_channel_mix_all" IS 'Orders by channel including unreconciled ones, test orders excluded. A voice row will not appear until a real customer places a voice order.';



CREATE OR REPLACE VIEW "public"."v_daily_sales" WITH ("security_invoker"='true') AS
 SELECT "trade_date",
    "count"(*) AS "orders",
    "round"("sum"("total"), 2) AS "revenue",
    "round"("avg"("total"), 2) AS "avg_order_value",
    "round"("max"("total"), 2) AS "largest_order",
    "count"(*) FILTER (WHERE ("payment_method" = 'cash'::"text")) AS "cash_orders",
    "count"(*) FILTER (WHERE ("payment_method" <> 'cash'::"text")) AS "card_orders"
   FROM "public"."v_paid_orders"
  GROUP BY "trade_date"
  ORDER BY "trade_date" DESC;


ALTER VIEW "public"."v_daily_sales" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_data_health" WITH ("security_invoker"='true') AS
 SELECT 'orders with no items'::"text" AS "issue",
    "count"(*) AS "rows_affected"
   FROM "public"."orders" "o"
  WHERE (NOT (EXISTS ( SELECT 1
           FROM "public"."order_items" "oi"
          WHERE ("oi"."order_id" = "o"."id"))))
UNION ALL
 SELECT 'paid orders with zero total'::"text" AS "issue",
    "count"(*) AS "rows_affected"
   FROM "public"."v_paid_orders"
  WHERE ("v_paid_orders"."total" <= (0)::numeric)
UNION ALL
 SELECT 'order_items with no parent order'::"text" AS "issue",
    "count"(*) AS "rows_affected"
   FROM "public"."order_items" "oi"
  WHERE (NOT (EXISTS ( SELECT 1
           FROM "public"."orders" "o"
          WHERE ("o"."id" = "oi"."order_id"))))
UNION ALL
 SELECT 'order total does not match item sum'::"text" AS "issue",
    "count"(*) AS "rows_affected"
   FROM ( SELECT "o"."id"
           FROM ("public"."orders" "o"
             JOIN "public"."order_items" "oi" ON (("oi"."order_id" = "o"."id")))
          GROUP BY "o"."id", "o"."total"
         HAVING ("abs"(("o"."total" - "sum"((("oi"."quantity")::numeric * "oi"."unit_price")))) > 0.01)) "mismatched"
UNION ALL
 SELECT 'orders stuck pending over 24h'::"text" AS "issue",
    "count"(*) AS "rows_affected"
   FROM "public"."orders"
  WHERE (("lower"(COALESCE("orders"."payment_status", ''::"text")) = 'pending'::"text") AND ("orders"."created_at" < ("now"() - '24:00:00'::interval)));


ALTER VIEW "public"."v_data_health" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_data_health" IS 'Standing audit. Every row should read zero. Non-zero is a defect, not a statistic. Wire into the QA suite as an automated check.';



CREATE OR REPLACE VIEW "public"."v_feedback_by_item" WITH ("security_invoker"='true') AS
 SELECT "oi"."product_name",
    "count"(DISTINCT "f"."id") AS "rated_orders",
    "round"("avg"("f"."rating"), 2) AS "avg_rating",
    "count"(*) FILTER (WHERE ("f"."rating" <= 2)) AS "detractor_orders"
   FROM ("public"."order_feedback" "f"
     JOIN "public"."order_items" "oi" ON (("oi"."order_id" = "f"."order_id")))
  WHERE ("f"."rating" IS NOT NULL)
  GROUP BY "oi"."product_name"
 HAVING ("count"(DISTINCT "f"."id") >= 3)
  ORDER BY ("round"("avg"("f"."rating"), 2)), ("count"(DISTINCT "f"."id")) DESC;


ALTER VIEW "public"."v_feedback_by_item" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_feedback_by_item" IS 'Average rating per item, minimum 3 rated orders. Lowest first - the top row is what to fix in the kitchen.';



CREATE OR REPLACE VIEW "public"."v_feedback_callbacks" WITH ("security_invoker"='true') AS
 SELECT "f"."id",
    "f"."order_id",
    "o"."display_id",
    "f"."rating",
    "f"."comment",
    "f"."responded_at",
    "f"."alerted_at",
    "round"((EXTRACT(epoch FROM ("now"() - "f"."responded_at")) / 3600.0), 1) AS "hours_waiting"
   FROM ("public"."order_feedback" "f"
     JOIN "public"."orders" "o" ON (("o"."id" = "f"."order_id")))
  WHERE (("f"."rating" <= 3) AND ("f"."responded_at" IS NOT NULL) AND ("f"."resolved_at" IS NULL))
  ORDER BY "f"."responded_at";


ALTER VIEW "public"."v_feedback_callbacks" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_feedback_callbacks" IS 'Unresolved unhappy customers, oldest first. Contains order-identifying data - operator use only, never shipped to the Console.';



CREATE OR REPLACE VIEW "public"."v_feedback_summary" WITH ("security_invoker"='true') AS
 SELECT "count"(*) AS "requests_sent",
    "count"(*) FILTER (WHERE ("responded_at" IS NOT NULL)) AS "responses",
    "round"(((100.0 * ("count"(*) FILTER (WHERE ("responded_at" IS NOT NULL)))::numeric) / (NULLIF("count"(*), 0))::numeric), 1) AS "response_rate_pct",
    "round"("avg"("rating") FILTER (WHERE ("rating" IS NOT NULL)), 2) AS "avg_rating",
    "count"(*) FILTER (WHERE ("rating" >= 4)) AS "promoters",
    "count"(*) FILTER (WHERE ("rating" = 3)) AS "passives",
    "count"(*) FILTER (WHERE ("rating" <= 2)) AS "detractors",
    "count"(*) FILTER (WHERE (("rating" <= 3) AND ("resolved_at" IS NULL) AND ("responded_at" IS NOT NULL))) AS "unresolved_complaints",
    "count"(*) FILTER (WHERE (("responded_at" IS NOT NULL) AND ("review_link_sent_at" IS NULL))) AS "responded_without_link"
   FROM "public"."order_feedback";


ALTER VIEW "public"."v_feedback_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_feedback_summary" IS 'responded_without_link should always be zero. Non-zero means someone was asked for a rating but never offered the review link, which is review gating.';



CREATE OR REPLACE VIEW "public"."v_feedback_trend" WITH ("security_invoker"='true') AS
 SELECT (("responded_at" AT TIME ZONE 'Europe/Dublin'::"text"))::"date" AS "trade_date",
    "count"(*) AS "responses",
    "round"("avg"("rating"), 2) AS "avg_rating",
    "count"(*) FILTER (WHERE ("rating" <= 2)) AS "detractors"
   FROM "public"."order_feedback"
  WHERE (("responded_at" IS NOT NULL) AND ("rating" IS NOT NULL))
  GROUP BY ((("responded_at" AT TIME ZONE 'Europe/Dublin'::"text"))::"date")
  ORDER BY ((("responded_at" AT TIME ZONE 'Europe/Dublin'::"text"))::"date") DESC;


ALTER VIEW "public"."v_feedback_trend" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_ingredient_usage_daily" WITH ("security_invoker"='true') AS
 SELECT "p"."trade_date",
    "i"."name" AS "ingredient",
    "i"."ingredient_type",
    "sum"("oi"."quantity") AS "portions_used",
    "count"(DISTINCT "oi"."order_id") AS "orders_containing"
   FROM ((("public"."order_items" "oi"
     JOIN "public"."v_paid_orders" "p" ON (("p"."id" = "oi"."order_id")))
     JOIN "public"."product_ingredients" "pi" ON ((("pi"."product_id" = "oi"."product_id") AND "pi"."is_default")))
     JOIN "public"."ingredients" "i" ON (("i"."id" = "pi"."ingredient_id")))
  GROUP BY "p"."trade_date", "i"."name", "i"."ingredient_type"
  ORDER BY "p"."trade_date" DESC, ("sum"("oi"."quantity")) DESC;


ALTER VIEW "public"."v_ingredient_usage_daily" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_ingredient_usage_daily" IS 'Gross portions of each ingredient sent out per trading day. Upper bound - does not subtract customer removals. Basis for par levels and prep lists.';



CREATE OR REPLACE VIEW "public"."v_ingredient_par_levels" WITH ("security_invoker"='true') AS
 SELECT "ingredient",
    "ingredient_type",
    "count"(*) AS "trading_days",
    "round"("avg"("portions_used"), 1) AS "avg_per_day",
    "max"("portions_used") AS "busiest_day",
    "round"(("percentile_cont"((0.9)::double precision) WITHIN GROUP (ORDER BY (("portions_used")::double precision)))::numeric, 1) AS "p90_per_day"
   FROM "public"."v_ingredient_usage_daily"
  GROUP BY "ingredient", "ingredient_type"
 HAVING ("count"(*) >= 3)
  ORDER BY ("round"("avg"("portions_used"), 1)) DESC;


ALTER VIEW "public"."v_ingredient_par_levels" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_ingredient_par_levels" IS 'Stock guidance. p90_per_day is the sensible par level - covers 9 days in 10 without over-ordering for the one freak day.';



CREATE OR REPLACE VIEW "public"."v_inventory_balances" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "name",
    NULL::"text" AS "sku",
    NULL::"text" AS "unit",
    NULL::numeric(12,3) AS "reorder_level",
    NULL::numeric(12,3) AS "par_level",
    NULL::numeric(12,4) AS "unit_cost",
    NULL::boolean AS "active",
    NULL::numeric(12,3) AS "quantity_on_hand",
    NULL::boolean AS "low_stock",
    NULL::timestamp with time zone AS "last_movement_at";


ALTER VIEW "public"."v_inventory_balances" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_item_mix" WITH ("security_invoker"='true') AS
 SELECT "oi"."product_name",
    "sum"("oi"."quantity") AS "units_sold",
    "round"("sum"((("oi"."quantity")::numeric * "oi"."unit_price")), 2) AS "revenue",
    "round"("avg"("oi"."unit_price"), 2) AS "avg_unit_price",
    "count"(DISTINCT "oi"."order_id") AS "appeared_in_orders",
    "round"(((100.0 * "sum"((("oi"."quantity")::numeric * "oi"."unit_price"))) / NULLIF("sum"("sum"((("oi"."quantity")::numeric * "oi"."unit_price"))) OVER (), (0)::numeric)), 1) AS "revenue_share_pct"
   FROM ("public"."order_items" "oi"
     JOIN "public"."v_paid_orders" "p" ON (("p"."id" = "oi"."order_id")))
  GROUP BY "oi"."product_name"
  ORDER BY ("round"("sum"((("oi"."quantity")::numeric * "oi"."unit_price")), 2)) DESC;


ALTER VIEW "public"."v_item_mix" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_kitchen_dispatch_retry_queue" WITH ("security_invoker"='true') AS
 SELECT "id",
    "order_id",
    "payload",
    "attempts",
    "last_error",
    "next_attempt_at",
    "created_at"
   FROM "public"."kitchen_dispatches" "d"
  WHERE (("status" = ANY (ARRAY['pending'::"text", 'failed'::"text"])) AND (COALESCE("next_attempt_at", "now"()) <= "now"()) AND ("attempts" < 10))
  ORDER BY COALESCE("next_attempt_at", "created_at"), "created_at";


ALTER VIEW "public"."v_kitchen_dispatch_retry_queue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_loyalty_balances" WITH ("security_invoker"='true') AS
 SELECT "user_id",
    (GREATEST(COALESCE("sum"("points_delta"), (0)::bigint), (0)::bigint))::integer AS "points_balance",
    (COALESCE("sum"("points_delta") FILTER (WHERE ("points_delta" > 0)), (0)::bigint))::integer AS "lifetime_points",
    ("count"(*) FILTER (WHERE ("event_type" = 'redeem'::"text")))::integer AS "rewards_redeemed",
    "max"("created_at") AS "last_activity_at"
   FROM "public"."loyalty_events" "e"
  GROUP BY "user_id";


ALTER VIEW "public"."v_loyalty_balances" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_modifier_attach" WITH ("security_invoker"='true') AS
 SELECT "count"(*) AS "item_lines",
    "count"(*) FILTER (WHERE (("jsonb_typeof"("oi"."selected_modifiers") = 'object'::"text") AND ("oi"."selected_modifiers" <> '{}'::"jsonb"))) AS "lines_with_modifiers",
    "round"(((100.0 * ("count"(*) FILTER (WHERE (("jsonb_typeof"("oi"."selected_modifiers") = 'object'::"text") AND ("oi"."selected_modifiers" <> '{}'::"jsonb"))))::numeric) / (NULLIF("count"(*), 0))::numeric), 1) AS "attach_rate_pct"
   FROM ("public"."order_items" "oi"
     JOIN "public"."v_paid_orders" "p" ON (("p"."id" = "oi"."order_id")));


ALTER VIEW "public"."v_modifier_attach" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_modifier_attach_daily" AS
 SELECT "p"."trade_date",
    "count"(*) AS "item_lines",
    "count"(*) FILTER (WHERE (("jsonb_typeof"("oi"."selected_modifiers") = 'object'::"text") AND ("oi"."selected_modifiers" <> '{}'::"jsonb"))) AS "lines_with_modifiers",
    "round"(((100.0 * ("count"(*) FILTER (WHERE (("jsonb_typeof"("oi"."selected_modifiers") = 'object'::"text") AND ("oi"."selected_modifiers" <> '{}'::"jsonb"))))::numeric) / (NULLIF("count"(*), 0))::numeric), 1) AS "attach_rate_pct"
   FROM ("public"."order_items" "oi"
     JOIN "public"."v_paid_orders" "p" ON (("p"."id" = "oi"."order_id")))
  GROUP BY "p"."trade_date"
  ORDER BY "p"."trade_date" DESC;


ALTER VIEW "public"."v_modifier_attach_daily" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_payment_integrity" WITH ("security_invoker"='true') AS
 SELECT "issue",
    "severity_rank",
    "severity",
    "display_id",
    "total",
    "payment_status",
    "payment_method",
    "reference",
    "created_at",
    "action"
   FROM ( SELECT 'duplicate_viva_transaction'::"text" AS "issue",
            1 AS "severity_rank",
            'critical'::"text" AS "severity",
            "o"."display_id",
            "o"."total",
            "o"."payment_status",
            ("o"."payment_method")::"text" AS "payment_method",
            "o"."viva_transaction_id" AS "reference",
            "o"."created_at",
            'One Viva transaction on more than one order. Possible double charge.'::"text" AS "action"
           FROM "public"."orders" "o"
          WHERE (("o"."viva_transaction_id" IS NOT NULL) AND ("o"."viva_transaction_id" IS DISTINCT FROM "o"."viva_order_code") AND (EXISTS ( SELECT 1
                   FROM "public"."orders" "o2"
                  WHERE (("o2"."viva_transaction_id" = "o"."viva_transaction_id") AND ("o2"."id" <> "o"."id")))))
        UNION ALL
         SELECT 'total_does_not_match_items'::"text",
            1,
            'critical'::"text",
            "o"."display_id",
            "o"."total",
            "o"."payment_status",
            ("o"."payment_method")::"text" AS "payment_method",
            NULL::"text",
            "o"."created_at",
            'Order total does not equal the sum of its items. Over or under charged.'::"text"
           FROM ("public"."orders" "o"
             JOIN ( SELECT "oi"."order_id",
                    "sum"((("oi"."quantity")::numeric * "oi"."unit_price")) AS "items_total"
                   FROM "public"."order_items" "oi"
                  GROUP BY "oi"."order_id") "s" ON (("s"."order_id" = "o"."id")))
          WHERE (("abs"(("o"."total" - "s"."items_total")) > 0.01) AND ("lower"(COALESCE("o"."payment_status", ''::"text")) = ANY (ARRAY['paid'::"text", 'completed'::"text"])))
        UNION ALL
         SELECT 'card_paid_without_webhook_reference'::"text",
            2,
            'high'::"text",
            "o"."display_id",
            "o"."total",
            "o"."payment_status",
            ("o"."payment_method")::"text" AS "payment_method",
            "o"."viva_transaction_id",
            "o"."created_at",
            'Card marked paid with no webhook reference (null, or equal to the order code). Cannot be reconciled against settlement.'::"text"
           FROM "public"."orders" "o"
          WHERE ((("o"."payment_method")::"text" = 'card'::"text") AND ("lower"(COALESCE("o"."payment_status", ''::"text")) = ANY (ARRAY['paid'::"text", 'completed'::"text"])) AND (("o"."viva_transaction_id" IS NULL) OR ("o"."viva_transaction_id" = "o"."viva_order_code")))
        UNION ALL
         SELECT 'stuck_processing'::"text",
            2,
            'high'::"text",
            "o"."display_id",
            "o"."total",
            "o"."payment_status",
            ("o"."payment_method")::"text" AS "payment_method",
            "o"."viva_transaction_id",
            "o"."created_at",
            'Payment left in processing. Resolve to completed or failed.'::"text"
           FROM "public"."orders" "o"
          WHERE (("lower"(COALESCE("o"."payment_status", ''::"text")) = 'processing'::"text") AND ("o"."created_at" < ("now"() - '01:00:00'::interval)))
        UNION ALL
         SELECT 'cash_not_reconciled'::"text",
            3,
            'medium'::"text",
            "o"."display_id",
            "o"."total",
            "o"."payment_status",
            ("o"."payment_method")::"text" AS "payment_method",
            NULL::"text",
            "o"."created_at",
            'Cash order not marked paid. Reconcile against the till.'::"text"
           FROM "public"."orders" "o"
          WHERE ((("o"."payment_method")::"text" = 'cash'::"text") AND ("lower"(COALESCE("o"."payment_status", ''::"text")) = ANY (ARRAY['unpaid'::"text", 'pending'::"text"])) AND ("o"."completed_at" IS NOT NULL))) "findings"
  ORDER BY "severity_rank", "created_at" DESC;


ALTER VIEW "public"."v_payment_integrity" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_payment_integrity" IS 'Money audit. A viva_transaction_id EQUAL to viva_order_code is the checkout code, not a payment - only a differing value came from the webhook. Getting that wrong produced a false critical alarm on 6 abandoned checkouts.';



CREATE OR REPLACE VIEW "public"."v_payment_integrity_summary" WITH ("security_invoker"='true') AS
 SELECT "issue",
    "severity",
    "count"(*) AS "occurrences",
    "round"("sum"("total"), 2) AS "value"
   FROM "public"."v_payment_integrity"
  GROUP BY "issue", "severity", "severity_rank"
  ORDER BY "severity_rank", ("count"(*)) DESC;


ALTER VIEW "public"."v_payment_integrity_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_payments_stuck" AS
 SELECT "display_id",
    "total",
    "payment_status",
    "viva_order_code",
    "created_at",
    "round"((EXTRACT(epoch FROM ("now"() - "created_at")) / 60.0)) AS "minutes_stuck"
   FROM "public"."orders"
  WHERE (("lower"(COALESCE("payment_status", ''::"text")) = 'processing'::"text") AND ("created_at" < ("now"() - '00:30:00'::interval)) AND ("is_test" = false))
  ORDER BY "created_at";


ALTER VIEW "public"."v_payments_stuck" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_prep_time" WITH ("security_invoker"='true') AS
 SELECT "trade_date",
    "count"(*) FILTER (WHERE ("completed_at" IS NOT NULL)) AS "completed_orders",
    "round"("avg"((EXTRACT(epoch FROM ("completed_at" - "created_at")) / 60.0)), 1) AS "avg_prep_mins",
    "round"(("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (((EXTRACT(epoch FROM ("completed_at" - "created_at")) / 60.0))::double precision)))::numeric, 1) AS "median_prep_mins",
    "round"(("percentile_cont"((0.9)::double precision) WITHIN GROUP (ORDER BY (((EXTRACT(epoch FROM ("completed_at" - "created_at")) / 60.0))::double precision)))::numeric, 1) AS "p90_prep_mins"
   FROM "public"."v_paid_orders"
  WHERE (("completed_at" IS NOT NULL) AND ("completed_at" > "created_at") AND (("completed_at" - "created_at") < '04:00:00'::interval))
  GROUP BY "trade_date"
  ORDER BY "trade_date" DESC;


ALTER VIEW "public"."v_prep_time" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_qa_summary" WITH ("security_invoker"='true') AS
 SELECT "count"(*) FILTER (WHERE ("status" = 'FAIL'::"text")) AS "failures",
    "count"(*) FILTER (WHERE (("status" = 'FAIL'::"text") AND ("severity" = 'P0'::"text"))) AS "p0_failures",
    "count"(*) FILTER (WHERE ("status" = 'PASS'::"text")) AS "passes",
    "string_agg"("check_id", ', '::"text") FILTER (WHERE ("status" = 'FAIL'::"text")) AS "failing_checks"
   FROM "public"."qa_checks"() "qa_checks"("check_id", "category", "severity", "status", "expected", "actual", "detail");


ALTER VIEW "public"."v_qa_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_review_coverage" WITH ("security_invoker"='true') AS
 SELECT "p"."trade_date",
    "count"(*) AS "completed_orders",
    "count"(*) FILTER (WHERE ("o"."review_sms_sent" IS TRUE)) AS "asked",
    "count"("f"."id") FILTER (WHERE ("f"."responded_at" IS NOT NULL)) AS "responded",
    "round"(((100.0 * ("count"(*) FILTER (WHERE ("o"."review_sms_sent" IS TRUE)))::numeric) / (NULLIF("count"(*), 0))::numeric), 1) AS "ask_rate_pct",
    "round"(((100.0 * ("count"("f"."id") FILTER (WHERE ("f"."responded_at" IS NOT NULL)))::numeric) / (NULLIF("count"(*) FILTER (WHERE ("o"."review_sms_sent" IS TRUE)), 0))::numeric), 1) AS "response_rate_pct"
   FROM (("public"."v_paid_orders" "p"
     JOIN "public"."orders" "o" ON (("o"."id" = "p"."id")))
     LEFT JOIN "public"."order_feedback" "f" ON (("f"."order_id" = "o"."id")))
  WHERE ("o"."completed_at" IS NOT NULL)
  GROUP BY "p"."trade_date"
  ORDER BY "p"."trade_date" DESC;


ALTER VIEW "public"."v_review_coverage" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_review_request_queue" WITH ("security_invoker"='true') AS
 WITH "candidate" AS (
         SELECT "o"."id" AS "order_id",
            "o"."display_id",
            "o"."customer_name",
            "o"."customer_phone",
            "o"."total",
            "o"."completed_at",
            ("o"."completed_at" + '01:15:00'::interval) AS "send_after"
           FROM ("public"."orders" "o"
             JOIN "public"."v_paid_orders" "p" ON (("p"."id" = "o"."id")))
          WHERE (("o"."completed_at" IS NOT NULL) AND ("o"."customer_phone" IS NOT NULL) AND ("o"."customer_phone" <> ''::"text") AND (COALESCE("o"."review_sms_sent", false) IS FALSE) AND ("o"."completed_at" >= ("now"() - '7 days'::interval)) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."order_feedback" "f"
                  WHERE ("f"."order_id" = "o"."id")))) AND (NOT (EXISTS ( SELECT 1
                   FROM ("public"."order_feedback" "f2"
                     JOIN "public"."orders" "o2" ON (("o2"."id" = "f2"."order_id")))
                  WHERE (("right"("regexp_replace"(COALESCE("o2"."customer_phone", ''::"text"), '\D'::"text", ''::"text", 'g'::"text"), 9) = "right"("regexp_replace"("o"."customer_phone", '\D'::"text", ''::"text", 'g'::"text"), 9)) AND ("f2"."requested_at" > ("now"() - '30 days'::interval)))))))
        )
 SELECT "order_id",
    "display_id",
    "customer_name",
    "customer_phone",
    "total",
    "completed_at",
    "send_after",
    "round"((EXTRACT(epoch FROM ("now"() - "completed_at")) / 60.0)) AS "minutes_since_collection"
   FROM "candidate" "c"
  WHERE (("send_after" <= "now"()) AND (EXTRACT(hour FROM ("now"() AT TIME ZONE 'Europe/Dublin'::"text")) >= (9)::numeric) AND (EXTRACT(hour FROM ("now"() AT TIME ZONE 'Europe/Dublin'::"text")) < (21)::numeric))
  ORDER BY "completed_at";


ALTER VIEW "public"."v_review_request_queue" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_review_request_queue" IS 'Orders due a review request right now: paid, collected 75+ min and under 7 days ago, never asked, customer not asked in 30 days, and local time is inside 09:00-21:00. An order maturing during quiet hours appears the next morning.';



CREATE OR REPLACE VIEW "public"."v_scheduled_order_release_queue" WITH ("security_invoker"='true') AS
 SELECT "id" AS "order_id",
    "display_id",
    "scheduled_for",
    "kitchen_release_at",
    "customer_name",
    "customer_phone",
    "total",
    "payment_method",
    "payment_status",
    "order_channel"
   FROM "public"."orders" "o"
  WHERE (("fulfillment_type" = 'scheduled'::"text") AND ("released_to_kitchen_at" IS NULL) AND ("kitchen_release_at" <= "now"()) AND (("status" IS NULL) OR ("status" <> 'completed'::"public"."order_status")) AND (("payment_method" <> 'card'::"public"."payment_method") OR ("lower"(COALESCE("payment_status", ''::"text")) = ANY (ARRAY['paid'::"text", 'completed'::"text"]))));


ALTER VIEW "public"."v_scheduled_order_release_queue" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_scheduled_order_release_queue" IS 'Service-role-only queue of paid or pay-on-collection scheduled orders due for canonical kitchen dispatch.';



CREATE OR REPLACE VIEW "public"."v_seo_readiness" AS
 SELECT 'telephone'::"text" AS "field",
    ("business_profile"."telephone" IS NOT NULL) AS "ready",
    'Required for local SEO and tap-to-call. Also remove format-detection=telephone=no from index.html.'::"text" AS "note"
   FROM "public"."business_profile"
  WHERE ("business_profile"."id" = 1)
UNION ALL
 SELECT 'geo coordinates'::"text" AS "field",
    (("business_profile"."latitude" IS NOT NULL) AND ("business_profile"."longitude" IS NOT NULL)) AS "ready",
    'Exact pin. Do not approximate - a wrong pin sends customers to the wrong place.'::"text" AS "note"
   FROM "public"."business_profile"
  WHERE ("business_profile"."id" = 1)
UNION ALL
 SELECT 'google_review_url'::"text" AS "field",
    ("business_profile"."google_review_url" IS NOT NULL) AS "ready",
    'Short g.page/r/ form. Also needed by Workflow S and the rating page.'::"text" AS "note"
   FROM "public"."business_profile"
  WHERE ("business_profile"."id" = 1)
UNION ALL
 SELECT 'google_maps_url'::"text" AS "field",
    ("business_profile"."google_maps_url" IS NOT NULL) AS "ready",
    'Google Business Profile link, for sameAs corroboration.'::"text" AS "note"
   FROM "public"."business_profile"
  WHERE ("business_profile"."id" = 1)
UNION ALL
 SELECT 'postal_code'::"text" AS "field",
    ("business_profile"."postal_code" IS NOT NULL) AS "ready",
    'Eircode.'::"text" AS "note"
   FROM "public"."business_profile"
  WHERE ("business_profile"."id" = 1)
UNION ALL
 SELECT 'allergens complete'::"text" AS "field",
    ( SELECT ("count"(*) = 0)
           FROM "public"."v_allergen_status"
          WHERE ("v_allergen_status"."status" = 'MISSING'::"text")) AS "ready",
    'Allergen markup is a ranking advantage and an FSAI requirement.'::"text" AS "note"
UNION ALL
 SELECT 'tiktok in social_urls'::"text" AS "field",
    ( SELECT COALESCE(("array_to_string"("business_profile"."social_urls", ','::"text") ~~ '%tiktok%'::"text"), false) AS "coalesce"
           FROM "public"."business_profile"
          WHERE ("business_profile"."id" = 1)) AS "ready",
    'TikTok profile exists; add it for sameAs corroboration.'::"text" AS "note";


ALTER VIEW "public"."v_seo_readiness" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_stock_conflicts" WITH ("security_invoker"='true') AS
 SELECT "i"."name" AS "out_of_stock_ingredient",
    "pr"."name" AS "still_orderable_product",
    "pr"."price",
    "pi"."is_removable"
   FROM (("public"."ingredients" "i"
     JOIN "public"."product_ingredients" "pi" ON ((("pi"."ingredient_id" = "i"."id") AND "pi"."is_default")))
     JOIN "public"."products" "pr" ON (("pr"."id" = "pi"."product_id")))
  WHERE (("i"."in_stock" IS FALSE) AND ("pr"."is_visible" IS TRUE) AND (COALESCE("pr"."is_available", true) IS TRUE))
  ORDER BY "i"."name", "pr"."name";


ALTER VIEW "public"."v_stock_conflicts" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_stock_conflicts" IS 'Every row is a live defect: an out-of-stock ingredient that is still a default part of an orderable product. Should always be empty.';



CREATE OR REPLACE VIEW "public"."v_trading_rhythm" WITH ("security_invoker"='true') AS
 SELECT "trade_dow",
    "to_char"((('2024-01-01'::"date" + ("trade_dow" - 1)))::timestamp with time zone, 'Day'::"text") AS "day_name",
    "trade_hour",
    "count"(*) AS "orders",
    "round"("sum"("total"), 2) AS "revenue"
   FROM "public"."v_paid_orders"
  GROUP BY "trade_dow", "trade_hour"
  ORDER BY "trade_dow", "trade_hour";


ALTER VIEW "public"."v_trading_rhythm" OWNER TO "postgres";


ALTER TABLE ONLY "public"."orders" ALTER COLUMN "display_id" SET DEFAULT "nextval"('"public"."orders_display_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistant_action_audit"
    ADD CONSTRAINT "assistant_action_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistant_action_proposals"
    ADD CONSTRAINT "assistant_action_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistant_request_log"
    ADD CONSTRAINT "assistant_request_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistant_setting_proposals"
    ADD CONSTRAINT "assistant_setting_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcasts"
    ADD CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_profile"
    ADD CONSTRAINT "business_profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_votes"
    ADD CONSTRAINT "community_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitor_profiles"
    ADD CONSTRAINT "competitor_profiles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."competitor_profiles"
    ADD CONSTRAINT "competitor_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitor_snapshots"
    ADD CONSTRAINT "competitor_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_notes"
    ADD CONSTRAINT "customer_notes_customer_phone_key" UNIQUE ("customer_phone");



ALTER TABLE ONLY "public"."customer_notes"
    ADD CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("phone_number");



ALTER TABLE ONLY "public"."feedback_tokens"
    ADD CONSTRAINT "feedback_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."food_safety_logs"
    ADD CONSTRAINT "food_safety_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."foodos_module_settings"
    ADD CONSTRAINT "foodos_module_settings_pkey" PRIMARY KEY ("module_key");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_name_unit_key" UNIQUE ("name", "unit");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_dispatches"
    ADD CONSTRAINT "kitchen_dispatches_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."kitchen_dispatches"
    ADD CONSTRAINT "kitchen_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_events"
    ADD CONSTRAINT "loyalty_events_order_id_event_type_key" UNIQUE ("order_id", "event_type");



ALTER TABLE ONLY "public"."loyalty_events"
    ADD CONSTRAINT "loyalty_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_metrics"
    ADD CONSTRAINT "marketing_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_metrics"
    ADD CONSTRAINT "marketing_metrics_provider_external_campaign_id_period_star_key" UNIQUE NULLS NOT DISTINCT ("provider", "external_campaign_id", "period_start", "period_end", "metric_name");



ALTER TABLE ONLY "public"."marketing_posts"
    ADD CONSTRAINT "marketing_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modifier_groups"
    ADD CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modifiers"
    ADD CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_feedback"
    ADD CONSTRAINT "order_feedback_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."order_feedback"
    ADD CONSTRAINT "order_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_ingestion_locks"
    ADD CONSTRAINT "payment_ingestion_locks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_product_id_key" UNIQUE ("product_id");



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_product_id_ingredient_id_key" UNIQUE ("product_id", "ingredient_id");



ALTER TABLE ONLY "public"."product_modifiers"
    ADD CONSTRAINT "product_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_modifiers"
    ADD CONSTRAINT "product_modifiers_product_id_group_id_key" UNIQUE ("product_id", "group_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_media_posts"
    ADD CONSTRAINT "social_media_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



CREATE INDEX "assistant_action_audit_actor_created_idx" ON "public"."assistant_action_audit" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "assistant_action_audit_proposal_idx" ON "public"."assistant_action_audit" USING "btree" ("proposal_id");



CREATE INDEX "assistant_action_audit_setting_proposal_idx" ON "public"."assistant_action_audit" USING "btree" ("setting_proposal_id");



CREATE INDEX "assistant_action_audit_target_idx" ON "public"."assistant_action_audit" USING "btree" ("target_type", "target_id", "created_at" DESC);



CREATE INDEX "assistant_action_proposals_actor_created_idx" ON "public"."assistant_action_proposals" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "assistant_action_proposals_pending_idx" ON "public"."assistant_action_proposals" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "assistant_action_proposals_target_product_idx" ON "public"."assistant_action_proposals" USING "btree" ("target_product_id");



CREATE INDEX "assistant_request_log_actor_created_idx" ON "public"."assistant_request_log" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "assistant_setting_proposals_actor_created_idx" ON "public"."assistant_setting_proposals" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "assistant_setting_proposals_pending_idx" ON "public"."assistant_setting_proposals" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "competitor_profiles_created_by_idx" ON "public"."competitor_profiles" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "competitor_snapshots_profile_time_idx" ON "public"."competitor_snapshots" USING "btree" ("competitor_id", "observed_at" DESC);



CREATE INDEX "competitor_snapshots_recorded_by_idx" ON "public"."competitor_snapshots" USING "btree" ("recorded_by") WHERE ("recorded_by" IS NOT NULL);



CREATE INDEX "feedback_tokens_order_idx" ON "public"."feedback_tokens" USING "btree" ("order_id");



CREATE INDEX "food_safety_logs_recorded_by_idx" ON "public"."food_safety_logs" USING "btree" ("recorded_by");



CREATE INDEX "food_safety_logs_status_time_idx" ON "public"."food_safety_logs" USING "btree" ("status", "recorded_at" DESC);



CREATE INDEX "food_safety_logs_type_time_idx" ON "public"."food_safety_logs" USING "btree" ("log_type", "recorded_at" DESC);



CREATE INDEX "foodos_module_settings_updated_by_idx" ON "public"."foodos_module_settings" USING "btree" ("updated_by") WHERE ("updated_by" IS NOT NULL);



CREATE INDEX "idx_broadcasts_metrics_verified_sent_at" ON "public"."broadcasts" USING "btree" ("metrics_verified", "sent_at" DESC);



CREATE INDEX "idx_ingredients_name" ON "public"."ingredients" USING "btree" ("name");



CREATE UNIQUE INDEX "idx_orders_display_id" ON "public"."orders" USING "btree" ("display_id");



CREATE INDEX "idx_orders_review_pending" ON "public"."orders" USING "btree" ("status", "review_sms_sent", "completed_at") WHERE (("status" = 'completed'::"public"."order_status") AND ("review_sms_sent" = false));



CREATE INDEX "idx_orders_viva_order_code" ON "public"."orders" USING "btree" ("viva_order_code");



CREATE INDEX "inventory_movements_item_time_idx" ON "public"."inventory_movements" USING "btree" ("inventory_item_id", "occurred_at" DESC);



CREATE INDEX "inventory_movements_order_idx" ON "public"."inventory_movements" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "inventory_movements_recorded_by_idx" ON "public"."inventory_movements" USING "btree" ("recorded_by") WHERE ("recorded_by" IS NOT NULL);



CREATE INDEX "kitchen_dispatch_retry_idx" ON "public"."kitchen_dispatches" USING "btree" ("next_attempt_at", "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "loyalty_events_order_idx" ON "public"."loyalty_events" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "loyalty_events_user_created_idx" ON "public"."loyalty_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "marketing_metrics_provider_period_idx" ON "public"."marketing_metrics" USING "btree" ("provider", "period_end" DESC);



CREATE INDEX "order_feedback_phone_idx" ON "public"."order_feedback" USING "btree" ("customer_phone");



CREATE INDEX "order_feedback_rating_idx" ON "public"."order_feedback" USING "btree" ("rating");



CREATE INDEX "order_feedback_responded_idx" ON "public"."order_feedback" USING "btree" ("responded_at" DESC);



CREATE INDEX "order_feedback_unresolved_idx" ON "public"."order_feedback" USING "btree" ("alerted_at") WHERE ("resolved_at" IS NULL);



CREATE INDEX "orders_is_test_idx" ON "public"."orders" USING "btree" ("is_test") WHERE "is_test";



CREATE INDEX "orders_scheduled_release_idx" ON "public"."orders" USING "btree" ("kitchen_release_at", "scheduled_for") WHERE (("fulfillment_type" = 'scheduled'::"text") AND ("released_to_kitchen_at" IS NULL) AND (("status" IS NULL) OR ("status" <> 'completed'::"public"."order_status")));



CREATE UNIQUE INDEX "orders_voice_call_id_unique" ON "public"."orders" USING "btree" ("voice_call_id") WHERE ("voice_call_id" IS NOT NULL);



CREATE INDEX "roster_shifts_created_by_idx" ON "public"."roster_shifts" USING "btree" ("created_by") WHERE ("created_by" IS NOT NULL);



CREATE INDEX "roster_shifts_staff_start_idx" ON "public"."roster_shifts" USING "btree" ("staff_user_id", "shift_start");



CREATE INDEX "roster_shifts_status_start_idx" ON "public"."roster_shifts" USING "btree" ("status", "shift_start");



CREATE UNIQUE INDEX "ux_payment_ingestion_locks_provider_tx" ON "public"."payment_ingestion_locks" USING "btree" ("provider", "transaction_id");



CREATE OR REPLACE VIEW "public"."v_inventory_balances" WITH ("security_invoker"='true') AS
 SELECT "i"."id",
    "i"."name",
    "i"."sku",
    "i"."unit",
    "i"."reorder_level",
    "i"."par_level",
    "i"."unit_cost",
    "i"."active",
    (("i"."opening_quantity" + COALESCE("sum"("m"."quantity_delta"), (0)::numeric)))::numeric(12,3) AS "quantity_on_hand",
    (("i"."opening_quantity" + COALESCE("sum"("m"."quantity_delta"), (0)::numeric)) <= "i"."reorder_level") AS "low_stock",
    "max"("m"."occurred_at") AS "last_movement_at"
   FROM ("public"."inventory_items" "i"
     LEFT JOIN "public"."inventory_movements" "m" ON (("m"."inventory_item_id" = "i"."id")))
  GROUP BY "i"."id";



CREATE OR REPLACE TRIGGER "enforce_preorder_slot_before_write" BEFORE INSERT OR UPDATE OF "fulfillment_type", "scheduled_for", "payment_status", "payment_method" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_preorder_slot"();



CREATE OR REPLACE TRIGGER "on_order_paid_update_customer" AFTER INSERT OR UPDATE OF "payment_status", "total" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_customer_on_order"();



CREATE OR REPLACE TRIGGER "order_feedback_touch" BEFORE UPDATE ON "public"."order_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "orders_enforce_card_reference" BEFORE INSERT OR UPDATE OF "payment_status", "viva_transaction_id" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_card_payment_reference"();



CREATE OR REPLACE TRIGGER "orders_normalise_payment_status" BEFORE INSERT OR UPDATE OF "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."normalise_payment_status"();



CREATE OR REPLACE TRIGGER "prevent_assistant_audit_update_or_delete" BEFORE DELETE OR UPDATE ON "public"."assistant_action_audit" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_assistant_audit_mutation"();



CREATE OR REPLACE TRIGGER "profiles_block_role_change" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_self_change"();



CREATE OR REPLACE TRIGGER "profiles_block_role_self_change" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_self_change"();



CREATE OR REPLACE TRIGGER "record_paid_order_loyalty_after_payment" AFTER INSERT OR UPDATE OF "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."record_paid_order_loyalty"();



CREATE OR REPLACE TRIGGER "trg_enforce_pay_on_collection" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_pay_on_collection"();



CREATE OR REPLACE TRIGGER "trg_recalculate_order_total" AFTER INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_order_total"();



CREATE OR REPLACE TRIGGER "trg_set_completed_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_completed_at"();



CREATE OR REPLACE TRIGGER "trg_validate_order_item_price" BEFORE INSERT ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."validate_order_item_price"();



CREATE OR REPLACE TRIGGER "update_cart_items_updated_at" BEFORE UPDATE ON "public"."cart_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_community_votes_updated_at" BEFORE UPDATE ON "public"."community_votes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_customer_notes_updated_at" BEFORE UPDATE ON "public"."customer_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_marketing_posts_updated_at" BEFORE UPDATE ON "public"."marketing_posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_promotions_updated_at" BEFORE UPDATE ON "public"."promotions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."assistant_action_audit"
    ADD CONSTRAINT "assistant_action_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assistant_action_audit"
    ADD CONSTRAINT "assistant_action_audit_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."assistant_action_proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assistant_action_audit"
    ADD CONSTRAINT "assistant_action_audit_setting_proposal_id_fkey" FOREIGN KEY ("setting_proposal_id") REFERENCES "public"."assistant_setting_proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assistant_action_proposals"
    ADD CONSTRAINT "assistant_action_proposals_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_action_proposals"
    ADD CONSTRAINT "assistant_action_proposals_target_product_id_fkey" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_request_log"
    ADD CONSTRAINT "assistant_request_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_setting_proposals"
    ADD CONSTRAINT "assistant_setting_proposals_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitor_profiles"
    ADD CONSTRAINT "competitor_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."competitor_snapshots"
    ADD CONSTRAINT "competitor_snapshots_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitor_snapshots"
    ADD CONSTRAINT "competitor_snapshots_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_tokens"
    ADD CONSTRAINT "feedback_tokens_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_safety_logs"
    ADD CONSTRAINT "food_safety_logs_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."foodos_module_settings"
    ADD CONSTRAINT "foodos_module_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kitchen_dispatches"
    ADD CONSTRAINT "kitchen_dispatches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_events"
    ADD CONSTRAINT "loyalty_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_events"
    ADD CONSTRAINT "loyalty_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_events"
    ADD CONSTRAINT "loyalty_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_posts"
    ADD CONSTRAINT "marketing_posts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."modifiers"
    ADD CONSTRAINT "modifiers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_feedback"
    ADD CONSTRAINT "order_feedback_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_modifiers"
    ADD CONSTRAINT "product_modifiers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_modifiers"
    ADD CONSTRAINT "product_modifiers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."roster_shifts"
    ADD CONSTRAINT "roster_shifts_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can manage marketing posts" ON "public"."marketing_posts" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can add competitor snapshots" ON "public"."competitor_snapshots" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create FoodOS module settings" ON "public"."foodos_module_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create inventory items" ON "public"."inventory_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can create roster shifts" ON "public"."roster_shifts" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all roles" ON "public"."user_roles" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage competitor profiles" ON "public"."competitor_profiles" TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read FoodOS module settings" ON "public"."foodos_module_settings" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read assistant audit" ON "public"."assistant_action_audit" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read competitor snapshots" ON "public"."competitor_snapshots" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read their assistant proposals" ON "public"."assistant_action_proposals" FOR SELECT TO "authenticated" USING ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Admins can read their assistant setting proposals" ON "public"."assistant_setting_proposals" FOR SELECT TO "authenticated" USING ((("actor_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Admins can read verified marketing metrics" ON "public"."marketing_metrics" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update FoodOS module settings" ON "public"."foodos_module_settings" FOR UPDATE TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update inventory items" ON "public"."inventory_items" FOR UPDATE TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update roster shifts" ON "public"."roster_shifts" FOR UPDATE TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Anyone can view active promotions" ON "public"."promotions" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view app settings" ON "public"."app_settings" FOR SELECT USING (true);



CREATE POLICY "Anyone can view community votes" ON "public"."community_votes" FOR SELECT USING (true);



CREATE POLICY "Anyone can view product allergens" ON "public"."product_allergens" FOR SELECT USING (true);



CREATE POLICY "Anyone can view products" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create their own orders" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Customers can view their own loyalty ledger" ON "public"."loyalty_events" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Ingredients are viewable by everyone" ON "public"."ingredients" FOR SELECT USING (true);



CREATE POLICY "Modifier groups are viewable by everyone" ON "public"."modifier_groups" FOR SELECT USING (true);



CREATE POLICY "Modifiers are viewable by everyone" ON "public"."modifiers" FOR SELECT USING (true);



CREATE POLICY "Operators can read food safety logs" ON "public"."food_safety_logs" FOR SELECT TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Operators can read inventory items" ON "public"."inventory_items" FOR SELECT TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Operators can read inventory movements" ON "public"."inventory_movements" FOR SELECT TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Operators can record food safety logs" ON "public"."food_safety_logs" FOR INSERT TO "authenticated" WITH CHECK ((("recorded_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"))));



CREATE POLICY "Operators can record inventory movements" ON "public"."inventory_movements" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("recorded_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"))));



CREATE POLICY "Product ingredients are viewable by everyone" ON "public"."product_ingredients" FOR SELECT USING (true);



CREATE POLICY "Product modifiers are viewable by everyone" ON "public"."product_modifiers" FOR SELECT USING (true);



CREATE POLICY "Products are viewable by everyone" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "Staff can add loyalty events" ON "public"."loyalty_events" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can create broadcasts" ON "public"."broadcasts" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can create order items" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can create orders" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can delete ingredients" ON "public"."ingredients" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can delete product ingredients" ON "public"."product_ingredients" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can delete products" ON "public"."products" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can insert ingredients" ON "public"."ingredients" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can insert product ingredients" ON "public"."product_ingredients" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can insert products" ON "public"."products" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can manage community votes" ON "public"."community_votes" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can manage customer notes" ON "public"."customer_notes" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can manage product allergens" ON "public"."product_allergens" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can manage promotions" ON "public"."promotions" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can manage social posts" ON "public"."social_media_posts" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can read their published shifts" ON "public"."roster_shifts" FOR SELECT TO "authenticated" USING (((("staff_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" <> 'draft'::"text")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can update app settings" ON "public"."app_settings" FOR UPDATE TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can update customers" ON "public"."customers" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can update ingredients" ON "public"."ingredients" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can update orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can update product ingredients" ON "public"."product_ingredients" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can update products" ON "public"."products" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can view all customers" ON "public"."customers" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can view all order items" ON "public"."order_items" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can view all orders" ON "public"."orders" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") OR ("public"."get_user_role"("auth"."uid"()) = ANY (ARRAY['staff'::"text", 'admin'::"text"]))));



CREATE POLICY "Staff can view broadcasts" ON "public"."broadcasts" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can view kitchen dispatch health" ON "public"."kitchen_dispatches" FOR SELECT TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Staff can view loyalty ledgers" ON "public"."loyalty_events" FOR SELECT TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."app_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Users can create items for their own orders" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own cart items" ON "public"."cart_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own cart items" ON "public"."cart_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own cart items" ON "public"."cart_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own cart items" ON "public"."cart_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own orders" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_action_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_action_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_request_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_setting_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."broadcasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_profile" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_profile_admin_write" ON "public"."business_profile" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "business_profile_public_read" ON "public"."business_profile" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."cart_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competitor_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competitor_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_safety_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."foodos_module_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_dispatches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modifier_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modifiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_feedback_admin_all" ON "public"."order_feedback" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_ingestion_locks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_allergens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_modifiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roster_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_media_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."app_settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."customers";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."apply_assistant_product_proposal"("p_proposal_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_assistant_product_proposal"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_assistant_product_proposal"("p_proposal_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_assistant_setting_proposal"("p_proposal_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_assistant_setting_proposal"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_assistant_setting_proposal"("p_proposal_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_staff_role_on_signup"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_staff_role_on_signup"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_product_allergens"("p_product_name" "text", "p_allergen_numbers" integer[], "p_confirmed_by" "text", "p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_product_allergens"("p_product_name" "text", "p_allergen_numbers" integer[], "p_confirmed_by" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_product_allergens"("p_product_name" "text", "p_allergen_numbers" integer[], "p_confirmed_by" "text", "p_source" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_management_assistant_quota"("p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_management_assistant_quota"("p_limit" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_management_assistant_quota"("p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_assistant_product_proposal"("p_product_id" "uuid", "p_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_assistant_product_proposal"("p_product_id" "uuid", "p_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_assistant_product_proposal"("p_product_id" "uuid", "p_changes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_assistant_setting_proposal"("p_setting_key" "text", "p_value" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_assistant_setting_proposal"("p_setting_key" "text", "p_value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_assistant_setting_proposal"("p_setting_key" "text", "p_value" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_card_payment_reference"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_card_payment_reference"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_pay_on_collection"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_pay_on_collection"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_preorder_slot"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_preorder_slot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_preorder_slot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_feedback_context"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_feedback_context"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_management_business_snapshot"("p_days" integer, "p_meal_period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_management_business_snapshot"("p_days" integer, "p_meal_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_management_business_snapshot"("p_days" integer, "p_meal_period" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_feedback_token"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_feedback_token"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_review_sent"("p_order_id" "uuid", "p_sid" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_review_sent"("p_order_id" "uuid", "p_sid" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalise_payment_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalise_payment_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalise_payment_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_assistant_audit_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_assistant_audit_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_role_self_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_role_self_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."qa_checks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."qa_checks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."qa_checks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalculate_order_total"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_order_total"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_feedback"("p_phone" "text", "p_rating" integer, "p_comment" "text", "p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_feedback"("p_phone" "text", "p_rating" integer, "p_comment" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_paid_order_loyalty"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_paid_order_loyalty"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_paid_order_loyalty"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_loyalty_reward"("p_user_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_loyalty_reward"("p_user_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_loyalty_reward"("p_user_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seo_menu_jsonld"() TO "anon";
GRANT ALL ON FUNCTION "public"."seo_menu_jsonld"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seo_menu_jsonld"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seo_opening_hours_jsonld"() TO "anon";
GRANT ALL ON FUNCTION "public"."seo_opening_hours_jsonld"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seo_opening_hours_jsonld"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seo_restaurant_jsonld"() TO "anon";
GRANT ALL ON FUNCTION "public"."seo_restaurant_jsonld"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seo_restaurant_jsonld"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_completed_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_completed_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_foodos_module_enabled"("p_module_key" "text", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_foodos_module_enabled"("p_module_key" "text", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_foodos_module_enabled"("p_module_key" "text", "p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_feedback_by_token"("p_token" "text", "p_rating" integer, "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_feedback_by_token"("p_token" "text", "p_rating" integer, "p_comment" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_customer_on_order"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_customer_on_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_order_item_price"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_order_item_price"() TO "service_role";


















GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."assistant_action_audit" TO "service_role";
GRANT SELECT ON TABLE "public"."assistant_action_audit" TO "authenticated";



GRANT ALL ON TABLE "public"."assistant_action_proposals" TO "service_role";
GRANT SELECT ON TABLE "public"."assistant_action_proposals" TO "authenticated";



GRANT ALL ON TABLE "public"."assistant_request_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."assistant_request_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."assistant_request_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."assistant_request_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."assistant_setting_proposals" TO "service_role";
GRANT SELECT ON TABLE "public"."assistant_setting_proposals" TO "authenticated";



GRANT ALL ON TABLE "public"."broadcasts" TO "anon";
GRANT ALL ON TABLE "public"."broadcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcasts" TO "service_role";



GRANT ALL ON TABLE "public"."business_profile" TO "anon";
GRANT ALL ON TABLE "public"."business_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."business_profile" TO "service_role";



GRANT ALL ON TABLE "public"."cart_items" TO "anon";
GRANT ALL ON TABLE "public"."cart_items" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_items" TO "service_role";



GRANT ALL ON TABLE "public"."community_votes" TO "anon";
GRANT ALL ON TABLE "public"."community_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."community_votes" TO "service_role";



GRANT ALL ON TABLE "public"."competitor_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."competitor_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."competitor_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."competitor_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."customer_notes" TO "anon";
GRANT ALL ON TABLE "public"."customer_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_notes" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_tokens" TO "anon";
GRANT ALL ON TABLE "public"."feedback_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."food_safety_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."food_safety_logs" TO "service_role";



GRANT ALL ON TABLE "public"."foodos_module_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."foodos_module_settings" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."kitchen_dispatches" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."kitchen_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."kitchen_dispatches" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_events" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_events" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_events" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_metrics" TO "service_role";
GRANT SELECT ON TABLE "public"."marketing_metrics" TO "authenticated";



GRANT ALL ON TABLE "public"."marketing_posts" TO "anon";
GRANT ALL ON TABLE "public"."marketing_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_posts" TO "service_role";



GRANT ALL ON TABLE "public"."modifier_groups" TO "anon";
GRANT ALL ON TABLE "public"."modifier_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."modifier_groups" TO "service_role";



GRANT ALL ON TABLE "public"."modifiers" TO "anon";
GRANT ALL ON TABLE "public"."modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."order_feedback" TO "anon";
GRANT ALL ON TABLE "public"."order_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."order_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."orders_display_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."orders_display_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."orders_display_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."payment_ingestion_locks" TO "anon";
GRANT ALL ON TABLE "public"."payment_ingestion_locks" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_ingestion_locks" TO "service_role";



GRANT ALL ON TABLE "public"."product_allergens" TO "anon";
GRANT ALL ON TABLE "public"."product_allergens" TO "authenticated";
GRANT ALL ON TABLE "public"."product_allergens" TO "service_role";



GRANT ALL ON TABLE "public"."product_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."product_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."product_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."product_modifiers" TO "anon";
GRANT ALL ON TABLE "public"."product_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."product_modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."promotions" TO "anon";
GRANT ALL ON TABLE "public"."promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotions" TO "service_role";



GRANT ALL ON TABLE "public"."roster_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."roster_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."social_media_posts" TO "anon";
GRANT ALL ON TABLE "public"."social_media_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_media_posts" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."v_addon_catalogue" TO "authenticated";
GRANT ALL ON TABLE "public"."v_addon_catalogue" TO "service_role";



GRANT ALL ON TABLE "public"."v_allergen_status" TO "authenticated";
GRANT ALL ON TABLE "public"."v_allergen_status" TO "service_role";



GRANT ALL ON TABLE "public"."v_paid_orders" TO "service_role";
GRANT SELECT ON TABLE "public"."v_paid_orders" TO "authenticated";



GRANT ALL ON TABLE "public"."v_channel_mix" TO "service_role";
GRANT SELECT ON TABLE "public"."v_channel_mix" TO "authenticated";



GRANT ALL ON TABLE "public"."v_channel_mix_all" TO "authenticated";
GRANT ALL ON TABLE "public"."v_channel_mix_all" TO "service_role";



GRANT ALL ON TABLE "public"."v_daily_sales" TO "service_role";
GRANT SELECT ON TABLE "public"."v_daily_sales" TO "authenticated";



GRANT ALL ON TABLE "public"."v_data_health" TO "service_role";
GRANT SELECT ON TABLE "public"."v_data_health" TO "authenticated";



GRANT ALL ON TABLE "public"."v_feedback_by_item" TO "authenticated";
GRANT ALL ON TABLE "public"."v_feedback_by_item" TO "service_role";



GRANT ALL ON TABLE "public"."v_feedback_callbacks" TO "service_role";



GRANT ALL ON TABLE "public"."v_feedback_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."v_feedback_summary" TO "service_role";



GRANT ALL ON TABLE "public"."v_feedback_trend" TO "authenticated";
GRANT ALL ON TABLE "public"."v_feedback_trend" TO "service_role";



GRANT ALL ON TABLE "public"."v_ingredient_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."v_ingredient_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."v_ingredient_par_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."v_ingredient_par_levels" TO "service_role";



GRANT ALL ON TABLE "public"."v_inventory_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."v_inventory_balances" TO "service_role";



GRANT ALL ON TABLE "public"."v_item_mix" TO "service_role";
GRANT SELECT ON TABLE "public"."v_item_mix" TO "authenticated";



GRANT ALL ON TABLE "public"."v_kitchen_dispatch_retry_queue" TO "service_role";



GRANT ALL ON TABLE "public"."v_loyalty_balances" TO "anon";
GRANT ALL ON TABLE "public"."v_loyalty_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."v_loyalty_balances" TO "service_role";



GRANT ALL ON TABLE "public"."v_modifier_attach" TO "service_role";
GRANT SELECT ON TABLE "public"."v_modifier_attach" TO "authenticated";



GRANT ALL ON TABLE "public"."v_modifier_attach_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."v_modifier_attach_daily" TO "service_role";



GRANT ALL ON TABLE "public"."v_payment_integrity" TO "authenticated";
GRANT ALL ON TABLE "public"."v_payment_integrity" TO "service_role";



GRANT ALL ON TABLE "public"."v_payment_integrity_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."v_payment_integrity_summary" TO "service_role";



GRANT ALL ON TABLE "public"."v_payments_stuck" TO "authenticated";
GRANT ALL ON TABLE "public"."v_payments_stuck" TO "service_role";



GRANT ALL ON TABLE "public"."v_prep_time" TO "service_role";
GRANT SELECT ON TABLE "public"."v_prep_time" TO "authenticated";



GRANT ALL ON TABLE "public"."v_qa_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."v_qa_summary" TO "service_role";



GRANT ALL ON TABLE "public"."v_review_coverage" TO "authenticated";
GRANT ALL ON TABLE "public"."v_review_coverage" TO "service_role";



GRANT ALL ON TABLE "public"."v_review_request_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."v_review_request_queue" TO "service_role";



GRANT ALL ON TABLE "public"."v_scheduled_order_release_queue" TO "service_role";



GRANT ALL ON TABLE "public"."v_seo_readiness" TO "anon";
GRANT ALL ON TABLE "public"."v_seo_readiness" TO "authenticated";
GRANT ALL ON TABLE "public"."v_seo_readiness" TO "service_role";



GRANT ALL ON TABLE "public"."v_stock_conflicts" TO "authenticated";
GRANT ALL ON TABLE "public"."v_stock_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."v_trading_rhythm" TO "service_role";
GRANT SELECT ON TABLE "public"."v_trading_rhythm" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































