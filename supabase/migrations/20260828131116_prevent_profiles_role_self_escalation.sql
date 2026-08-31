-- ============================================================================
-- SECURITY: block privilege escalation via profiles.role
--
-- The policy "Users can update their own profile" allows any authenticated user
-- to update every column of their own row, including `role`. get_user_role()
-- reads profiles.role, and the policy "Staff can view all profiles" trusts
-- get_user_role(). So any of the 240 registered users could set their own role
-- to 'admin' and read every customer profile in the database.
--
-- Postgres RLS policies cannot restrict individual columns, so this is enforced
-- with a BEFORE UPDATE trigger instead.
--
-- Scope: blocks a user changing THEIR OWN role. Admins (per user_roles, the
-- store that cannot be self-written) are unaffected. Service-role callers have
-- auth.uid() = null and are unaffected, since they already bypass RLS entirely.
--
-- ROLLBACK:
--   drop trigger if exists profiles_block_role_self_change on public.profiles;
--   drop function if exists public.prevent_role_self_change();
-- ============================================================================

create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.prevent_role_self_change() is
  'Blocks self-service privilege escalation through profiles.role. user_roles is the source of truth for roles; profiles.role is legacy and should be dropped once get_user_role() reads user_roles.';

drop trigger if exists profiles_block_role_self_change on public.profiles;

create trigger profiles_block_role_self_change
  before update on public.profiles
  for each row
  execute function public.prevent_role_self_change();
