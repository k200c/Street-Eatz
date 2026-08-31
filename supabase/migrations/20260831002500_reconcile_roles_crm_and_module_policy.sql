-- Reconcile deterministic legacy mirrors with their authoritative records.
-- No orders or payment outcomes are deleted or changed by this migration.

insert into public.user_roles (user_id, role)
select p.id, 'customer'::public.app_role
from public.profiles p
where not exists (
  select 1 from public.user_roles ur where ur.user_id = p.id
);

with authoritative_role as (
  select
    user_id,
    case
      when bool_or(role = 'admin'::public.app_role) then 'admin'::public.user_role
      when bool_or(role = 'staff'::public.app_role) then 'staff'::public.user_role
      else 'customer'::public.user_role
    end as role
  from public.user_roles
  group by user_id
)
update public.profiles p
set role = ar.role, updated_at = now()
from authoritative_role ar
where ar.user_id = p.id
  and p.role is distinct from ar.role;

update public.customers c
set
  total_spend = coalesce((
    select sum(o.total)
    from public.v_paid_orders vp
    join public.orders o on o.id = vp.id
    where o.customer_phone = c.phone_number
  ), 0),
  visit_count = coalesce((
    select count(*)
    from public.v_paid_orders vp
    join public.orders o on o.id = vp.id
    where o.customer_phone = c.phone_number
  ), 0),
  last_order_date = (
    select max(o.created_at)
    from public.v_paid_orders vp
    join public.orders o on o.id = vp.id
    where o.customer_phone = c.phone_number
  ),
  updated_at = now();

-- A visible product literally named as a test fixture must not be orderable in production.
update public.products
set is_visible = false, is_available = false, updated_at = now()
where lower(name) like '%test%' and is_visible is true;

-- The ALL policy already grants the same administrator SELECT access.
drop policy if exists "Admins can read competitor profiles" on public.competitor_profiles;
