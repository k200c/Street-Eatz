alter table public.app_settings
  add column if not exists google_review_url text;

alter table public.app_settings
  drop constraint if exists app_settings_google_review_url_check;

alter table public.app_settings
  add constraint app_settings_google_review_url_check check (
    google_review_url is null
    or google_review_url ~ '^https://search\.google\.com/local/writereview\?placeid=[A-Za-z0-9_-]+$'
    or google_review_url ~ '^https://g\.page/.+/review/?$'
  );

drop policy if exists "Staff can update app settings" on public.app_settings;

create policy "Staff can update app settings"
on public.app_settings
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'staff'::public.app_role)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
)
with check (
  public.has_role((select auth.uid()), 'staff'::public.app_role)
  or public.has_role((select auth.uid()), 'admin'::public.app_role)
);

comment on column public.app_settings.google_review_url is
  'Direct, unfiltered Google review destination configured by an authorised operator.';
