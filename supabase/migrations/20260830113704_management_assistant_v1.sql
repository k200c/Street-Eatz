-- ============================================================================
-- FOOD OS MODULE 37: MANAGEMENT ASSISTANT v1
--
-- The language model is never allowed to write products directly. It can only
-- create a short-lived proposal. The signed-in admin must confirm that exact
-- proposal, after which this database function applies it atomically and writes
-- an immutable audit record.
-- ============================================================================

create table if not exists public.assistant_action_proposals (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_product_id uuid not null references public.products(id) on delete cascade,
  requested_changes jsonb not null,
  before_state jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists assistant_action_proposals_actor_created_idx
  on public.assistant_action_proposals (actor_id, created_at desc);
create index if not exists assistant_action_proposals_target_product_idx
  on public.assistant_action_proposals (target_product_id);
create index if not exists assistant_action_proposals_pending_idx
  on public.assistant_action_proposals (expires_at)
  where status = 'pending';

create table if not exists public.assistant_setting_proposals (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  setting_key text not null
    check (setting_key in ('current_wait_time', 'is_store_open')),
  requested_value jsonb not null,
  before_value jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists assistant_setting_proposals_actor_created_idx
  on public.assistant_setting_proposals (actor_id, created_at desc);
create index if not exists assistant_setting_proposals_pending_idx
  on public.assistant_setting_proposals (expires_at)
  where status = 'pending';

create table if not exists public.assistant_action_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  proposal_id uuid references public.assistant_action_proposals(id) on delete set null,
  setting_proposal_id uuid references public.assistant_setting_proposals(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  before_state jsonb,
  after_state jsonb,
  status text not null check (status in ('applied', 'rejected_stale', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists assistant_action_audit_actor_created_idx
  on public.assistant_action_audit (actor_id, created_at desc);
create index if not exists assistant_action_audit_proposal_idx
  on public.assistant_action_audit (proposal_id);
create index if not exists assistant_action_audit_setting_proposal_idx
  on public.assistant_action_audit (setting_proposal_id);
create index if not exists assistant_action_audit_target_idx
  on public.assistant_action_audit (target_type, target_id, created_at desc);

create or replace function public.prevent_assistant_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Assistant audit records are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists prevent_assistant_audit_update_or_delete
  on public.assistant_action_audit;
create trigger prevent_assistant_audit_update_or_delete
  before update or delete on public.assistant_action_audit
  for each row execute function public.prevent_assistant_audit_mutation();

-- A small server-side request ledger limits authenticated AI spend even when
-- requests land on different serverless instances.
create table if not exists public.assistant_request_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists assistant_request_log_actor_created_idx
  on public.assistant_request_log (actor_id, created_at desc);

alter table public.assistant_action_proposals enable row level security;
alter table public.assistant_setting_proposals enable row level security;
alter table public.assistant_action_audit enable row level security;
alter table public.assistant_request_log enable row level security;

create policy "Admins can read their assistant proposals"
  on public.assistant_action_proposals for select to authenticated
  using (
    actor_id = (select auth.uid())
    and public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

create policy "Admins can read assistant audit"
  on public.assistant_action_audit for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy "Admins can read their assistant setting proposals"
  on public.assistant_setting_proposals for select to authenticated
  using (
    actor_id = (select auth.uid())
    and public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

revoke all on public.assistant_action_proposals from anon, authenticated;
revoke all on public.assistant_setting_proposals from anon, authenticated;
revoke all on public.assistant_action_audit from anon, authenticated;
revoke all on public.assistant_request_log from anon, authenticated;
grant select on public.assistant_action_proposals to authenticated;
grant select on public.assistant_setting_proposals to authenticated;
grant select on public.assistant_action_audit to authenticated;

create or replace function public.consume_management_assistant_quota(
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.create_assistant_product_proposal(
  p_product_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.apply_assistant_product_proposal(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.create_assistant_setting_proposal(
  p_setting_key text,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.apply_assistant_setting_proposal(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.consume_management_assistant_quota(integer, integer) from public, anon;
revoke all on function public.create_assistant_product_proposal(uuid, jsonb) from public, anon;
revoke all on function public.apply_assistant_product_proposal(uuid) from public, anon;
revoke all on function public.create_assistant_setting_proposal(text, jsonb) from public, anon;
revoke all on function public.apply_assistant_setting_proposal(uuid) from public, anon;
revoke all on function public.prevent_assistant_audit_mutation() from public, anon, authenticated;
grant execute on function public.consume_management_assistant_quota(integer, integer) to authenticated;
grant execute on function public.create_assistant_product_proposal(uuid, jsonb) to authenticated;
grant execute on function public.apply_assistant_product_proposal(uuid) to authenticated;
grant execute on function public.create_assistant_setting_proposal(text, jsonb) to authenticated;
grant execute on function public.apply_assistant_setting_proposal(uuid) to authenticated;

comment on table public.assistant_action_proposals is
  'Short-lived, admin-owned previews of AI-requested product changes. No proposal is applied without explicit confirmation.';
comment on table public.assistant_action_audit is
  'Immutable audit log for management-assistant mutations and stale-write rejections.';
