alter table public.orders
  add column if not exists voice_call_id text;

alter table public.orders
  drop constraint if exists orders_voice_call_id_length_check;

alter table public.orders
  add constraint orders_voice_call_id_length_check
  check (voice_call_id is null or char_length(voice_call_id) between 8 and 200);

create unique index if not exists orders_voice_call_id_unique
  on public.orders (voice_call_id)
  where voice_call_id is not null;

comment on column public.orders.voice_call_id is
  'Provider call identifier used as the idempotency key for voice ordering. Never reuse across calls.';
