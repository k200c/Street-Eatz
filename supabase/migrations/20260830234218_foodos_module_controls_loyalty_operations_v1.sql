-- FOOD OS: configurable modules, seven-order loyalty, operations and intelligence foundations.
-- Dashboards may only display verified source data. Connection-required modules must show an honest empty state.

update public.app_settings
set
  loyalty_enabled = true,
  loyalty_points_per_order = 1,
  loyalty_reward_cost = 7,
  loyalty_reward_label = 'Free Chips',
  updated_at = now()
where id = 1;

create table public.foodos_module_settings (
  module_key text primary key check (module_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  domain text not null check (domain in ('marketing', 'operations', 'intelligence', 'customer', 'finance')),
  label text not null check (char_length(trim(label)) between 3 and 80),
  description text not null check (char_length(trim(description)) between 3 and 240),
  enabled boolean not null default true,
  lifecycle_status text not null default 'mvp'
    check (lifecycle_status in ('live', 'mvp', 'connection_required', 'planned', 'paused')),
  display_order smallint not null default 100 check (display_order between 0 and 1000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.foodos_module_settings enable row level security;

create policy "Admins can read FoodOS module settings"
on public.foodos_module_settings for select
to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy "Admins can create FoodOS module settings"
on public.foodos_module_settings for insert
to authenticated
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

create policy "Admins can update FoodOS module settings"
on public.foodos_module_settings for update
to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

revoke all on public.foodos_module_settings from public, anon;
grant select, insert, update on public.foodos_module_settings to authenticated;

insert into public.foodos_module_settings
  (module_key, domain, label, description, enabled, lifecycle_status, display_order)
values
  ('marketing_sms', 'marketing', 'SMS Broadcasts', 'Consent-aware weekly broadcasts with provider delivery evidence.', true, 'live', 10),
  ('marketing_email', 'marketing', 'Email Marketing', 'Campaign delivery, opens, clicks, bounces and unsubscribes from the email provider.', true, 'connection_required', 20),
  ('marketing_ads', 'marketing', 'Ads Management', 'Google and Meta campaign spend, conversion and return reporting.', true, 'connection_required', 30),
  ('marketing_loyalty', 'marketing', 'Loyalty', 'One stamp per paid order; every seventh paid order unlocks Free Chips.', true, 'live', 40),
  ('marketing_community', 'marketing', 'Community Vote', 'Customer voting for specials and product ideas.', true, 'mvp', 50),
  ('marketing_coupons', 'marketing', 'Coupons', 'Discount-code creation and redemption controls.', false, 'planned', 60),
  ('marketing_banner', 'marketing', 'Menu Banner', 'A configurable promotional banner on the ordering menu.', true, 'live', 70),
  ('operations_inventory', 'operations', 'Inventory & Stock', 'Movement-led stock balances, reorder levels, waste and variance.', true, 'mvp', 10),
  ('operations_roster', 'operations', 'Rostering & Scheduling', 'Published shifts, coverage, breaks and staff availability.', true, 'mvp', 20),
  ('operations_haccp', 'operations', 'HACCP', 'Time-stamped control-point records and corrective actions.', true, 'mvp', 30),
  ('operations_food_safety', 'operations', 'Food Safety', 'Opening, closing, cleaning, allergen and incident evidence.', true, 'mvp', 40),
  ('operations_end_of_day', 'operations', 'End of Day', 'Cash, card, tips and operational close-out reconciliation.', true, 'planned', 50),
  ('intelligence_competitors', 'intelligence', 'Competitor Intelligence', 'Evidence-backed pricing, menu, review and offer comparisons.', true, 'mvp', 10)
on conflict (module_key) do update
set
  domain = excluded.domain,
  label = excluded.label,
  description = excluded.description,
  display_order = excluded.display_order,
  updated_at = now();

create or replace function public.set_foodos_module_enabled(
  p_module_key text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.set_foodos_module_enabled(text, boolean) from public, anon;
grant execute on function public.set_foodos_module_enabled(text, boolean) to authenticated;

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  sku text,
  unit text not null check (unit in ('each', 'g', 'kg', 'ml', 'l', 'pack', 'case')),
  opening_quantity numeric(12,3) not null default 0 check (opening_quantity >= 0),
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  par_level numeric(12,3) check (par_level is null or par_level >= reorder_level),
  unit_cost numeric(12,4) check (unit_cost is null or unit_cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, unit)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('purchase', 'usage', 'waste', 'count_adjustment', 'transfer', 'return')),
  quantity_delta numeric(12,3) not null check (quantity_delta <> 0),
  unit_cost numeric(12,4) check (unit_cost is null or unit_cost >= 0),
  order_id uuid references public.orders(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid references auth.users(id) on delete set null default auth.uid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index inventory_movements_item_time_idx
  on public.inventory_movements (inventory_item_id, occurred_at desc);
create index inventory_movements_order_idx
  on public.inventory_movements (order_id) where order_id is not null;

create view public.v_inventory_balances
with (security_invoker = true)
as
select
  i.id,
  i.name,
  i.sku,
  i.unit,
  i.reorder_level,
  i.par_level,
  i.unit_cost,
  i.active,
  (i.opening_quantity + coalesce(sum(m.quantity_delta), 0))::numeric(12,3) as quantity_on_hand,
  ((i.opening_quantity + coalesce(sum(m.quantity_delta), 0)) <= i.reorder_level) as low_stock,
  max(m.occurred_at) as last_movement_at
from public.inventory_items i
left join public.inventory_movements m on m.inventory_item_id = i.id
group by i.id;

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy "Operators can read inventory items"
on public.inventory_items for select to authenticated
using (
  public.has_role((select auth.uid()), 'staff'::public.app_role)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);
create policy "Admins can create inventory items"
on public.inventory_items for insert to authenticated
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins can update inventory items"
on public.inventory_items for update to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Operators can read inventory movements"
on public.inventory_movements for select to authenticated
using (
  public.has_role((select auth.uid()), 'staff'::public.app_role)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);
create policy "Operators can record inventory movements"
on public.inventory_movements for insert to authenticated
with check (
  (select auth.uid()) is not null
  and recorded_by = (select auth.uid())
  and (
    public.has_role((select auth.uid()), 'staff'::public.app_role)
    or public.has_role((select auth.uid()), 'admin'::public.app_role)
  )
);

revoke all on public.inventory_items, public.inventory_movements, public.v_inventory_balances from public, anon;
grant select on public.inventory_items, public.inventory_movements, public.v_inventory_balances to authenticated;
grant insert on public.inventory_items, public.inventory_movements to authenticated;
grant update on public.inventory_items to authenticated;

create table public.roster_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.profiles(id) on delete restrict,
  shift_start timestamptz not null,
  shift_end timestamptz not null,
  break_minutes smallint not null default 0 check (break_minutes between 0 and 240),
  role_label text not null default 'Team Member' check (char_length(trim(role_label)) between 2 and 80),
  status text not null default 'draft' check (status in ('draft', 'published', 'confirmed', 'completed', 'cancelled')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shift_end > shift_start)
);

create index roster_shifts_staff_start_idx on public.roster_shifts (staff_user_id, shift_start);
create index roster_shifts_status_start_idx on public.roster_shifts (status, shift_start);
alter table public.roster_shifts enable row level security;

create policy "Staff can read their published shifts"
on public.roster_shifts for select to authenticated
using (
  (staff_user_id = (select auth.uid()) and status <> 'draft')
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);
create policy "Admins can create roster shifts"
on public.roster_shifts for insert to authenticated
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins can update roster shifts"
on public.roster_shifts for update to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

revoke all on public.roster_shifts from public, anon;
grant select, insert, update on public.roster_shifts to authenticated;

create table public.food_safety_logs (
  id uuid primary key default gen_random_uuid(),
  log_type text not null check (log_type in ('fridge_temperature', 'freezer_temperature', 'cooking_temperature', 'cooling_temperature', 'cleaning', 'opening_check', 'closing_check', 'allergen_check', 'delivery_check', 'incident')),
  checkpoint text not null check (char_length(trim(checkpoint)) between 2 and 160),
  numeric_value numeric(10,2),
  unit text check (unit is null or unit in ('celsius', 'minutes', 'boolean', 'count')),
  status text not null check (status in ('pass', 'fail', 'not_applicable')),
  corrective_action text check (corrective_action is null or char_length(corrective_action) <= 1000),
  notes text check (notes is null or char_length(notes) <= 1000),
  recorded_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (status <> 'fail' or char_length(trim(coalesce(corrective_action, ''))) >= 3)
);

create index food_safety_logs_type_time_idx on public.food_safety_logs (log_type, recorded_at desc);
create index food_safety_logs_status_time_idx on public.food_safety_logs (status, recorded_at desc);
alter table public.food_safety_logs enable row level security;

create policy "Operators can read food safety logs"
on public.food_safety_logs for select to authenticated
using (
  public.has_role((select auth.uid()), 'staff'::public.app_role)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);
create policy "Operators can record food safety logs"
on public.food_safety_logs for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and (
    public.has_role((select auth.uid()), 'staff'::public.app_role)
    or public.has_role((select auth.uid()), 'admin'::public.app_role)
  )
);

revoke all on public.food_safety_logs from public, anon;
grant select, insert on public.food_safety_logs to authenticated;

create table public.competitor_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 120),
  website_url text,
  google_maps_url text,
  active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitor_profiles(id) on delete cascade,
  observed_at timestamptz not null default now(),
  source_type text not null check (source_type in ('google_business', 'website', 'menu', 'social', 'manual')),
  average_rating numeric(2,1) check (average_rating is null or average_rating between 1 and 5),
  review_count integer check (review_count is null or review_count >= 0),
  menu_item_count integer check (menu_item_count is null or menu_item_count >= 0),
  entry_price numeric(10,2) check (entry_price is null or entry_price >= 0),
  average_main_price numeric(10,2) check (average_main_price is null or average_main_price >= 0),
  offer_summary text check (offer_summary is null or char_length(offer_summary) <= 1000),
  evidence_url text,
  notes text check (notes is null or char_length(notes) <= 1000),
  recorded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index competitor_snapshots_profile_time_idx on public.competitor_snapshots (competitor_id, observed_at desc);
alter table public.competitor_profiles enable row level security;
alter table public.competitor_snapshots enable row level security;

create policy "Admins can read competitor profiles"
on public.competitor_profiles for select to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins can manage competitor profiles"
on public.competitor_profiles for all to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins can read competitor snapshots"
on public.competitor_snapshots for select to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role));
create policy "Admins can add competitor snapshots"
on public.competitor_snapshots for insert to authenticated
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

revoke all on public.competitor_profiles, public.competitor_snapshots from public, anon;
grant select, insert, update, delete on public.competitor_profiles to authenticated;
grant select, insert on public.competitor_snapshots to authenticated;

create table public.marketing_metrics (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('twilio_sms', 'sendgrid_email', 'google_ads', 'meta_ads', 'google_business')),
  external_campaign_id text,
  campaign_name text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  metric_name text not null check (metric_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  metric_value numeric(18,4) not null,
  metric_unit text not null check (metric_unit in ('count', 'percent', 'eur', 'seconds')),
  provenance text not null check (provenance in ('provider_api', 'provider_webhook', 'paid_order_attribution')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique nulls not distinct (provider, external_campaign_id, period_start, period_end, metric_name)
);

create index marketing_metrics_provider_period_idx on public.marketing_metrics (provider, period_end desc);
alter table public.marketing_metrics enable row level security;

create policy "Admins can read verified marketing metrics"
on public.marketing_metrics for select to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role));

revoke all on public.marketing_metrics from public, anon, authenticated;
grant select on public.marketing_metrics to authenticated;

comment on table public.foodos_module_settings is 'Per-client FoodOS module visibility and lifecycle state. No secrets or vendor credentials.';
comment on table public.inventory_movements is 'Immutable stock movement ledger; balances derive from opening quantity plus movements.';
comment on table public.food_safety_logs is 'Immutable HACCP and food-safety evidence. Corrections are recorded as new evidence, not edits.';
comment on table public.competitor_snapshots is 'Time-stamped competitor observations with source evidence; never AI-invented market data.';
comment on table public.marketing_metrics is 'Verified provider or paid-order-attributed marketing facts only. Browser writes are intentionally blocked.';
