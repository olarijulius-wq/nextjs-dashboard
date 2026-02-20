create table if not exists public.billing_events (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid null references public.workspaces(id) on delete set null,
  user_email text null,
  event_type text not null,
  stripe_event_id text null,
  stripe_object_id text null,
  status text null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_workspace_created_idx
  on public.billing_events (workspace_id, created_at desc);

create index if not exists billing_events_user_created_idx
  on public.billing_events (lower(user_email), created_at desc);

create unique index if not exists billing_events_stripe_event_id_uidx
  on public.billing_events (stripe_event_id)
  where stripe_event_id is not null;

create table if not exists public.dunning_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  user_email text null,
  subscription_status text not null default 'unknown',
  last_payment_failure_at timestamptz null,
  last_recovery_email_at timestamptz null,
  last_banner_dismissed_at timestamptz null,
  recovery_required boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists dunning_state_recovery_updated_idx
  on public.dunning_state (recovery_required, updated_at desc);
