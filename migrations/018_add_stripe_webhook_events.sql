create table if not exists public.stripe_webhook_events (
  id bigserial primary key,
  event_id text not null unique,
  event_type text not null,
  account text null,
  livemode boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  status text not null default 'received',
  error text null
);

create index if not exists stripe_webhook_events_received_at_idx
  on public.stripe_webhook_events (received_at desc);

create index if not exists stripe_webhook_events_status_received_at_idx
  on public.stripe_webhook_events (status, received_at desc);
