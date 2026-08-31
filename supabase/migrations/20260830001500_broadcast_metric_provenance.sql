-- FOOD OS: SMS broadcast metric provenance
-- Existing broadcast metrics were created before provider attribution existed.
-- They remain stored for auditability but are explicitly unverified and must
-- not be presented as business performance.

alter table public.broadcasts
  add column if not exists metrics_verified boolean not null default false,
  add column if not exists metrics_source text not null default 'legacy_unverified',
  add column if not exists delivery_status text not null default 'unknown',
  add column if not exists accepted_recipients integer not null default 0,
  add column if not exists delivered_recipients integer not null default 0,
  add column if not exists failed_recipients integer not null default 0,
  add column if not exists metrics_verified_at timestamptz;

alter table public.broadcasts
  drop constraint if exists broadcasts_metrics_source_check,
  add constraint broadcasts_metrics_source_check check (
    metrics_source in ('legacy_unverified', 'workflow_ack', 'twilio_callback', 'paid_order_attribution')
  ),
  drop constraint if exists broadcasts_delivery_status_check,
  add constraint broadcasts_delivery_status_check check (
    delivery_status in ('unknown', 'queued', 'accepted', 'partial', 'delivered', 'failed')
  ),
  drop constraint if exists broadcasts_recipient_counts_nonnegative,
  add constraint broadcasts_recipient_counts_nonnegative check (
    accepted_recipients >= 0 and delivered_recipients >= 0 and failed_recipients >= 0
  ),
  drop constraint if exists broadcasts_verified_timestamp_check,
  add constraint broadcasts_verified_timestamp_check check (
    not metrics_verified or metrics_verified_at is not null
  );

comment on column public.broadcasts.metrics_verified is
  'True only after provider delivery evidence and/or paid-order attribution has been processed.';
comment on column public.broadcasts.metrics_source is
  'Provenance for the displayed metric. Legacy rows default to unverified and are hidden from performance totals.';
comment on column public.broadcasts.delivery_status is
  'Aggregate provider delivery state. SMS has delivery status, not an email-style open rate.';

create index if not exists idx_broadcasts_metrics_verified_sent_at
  on public.broadcasts (metrics_verified, sent_at desc);
