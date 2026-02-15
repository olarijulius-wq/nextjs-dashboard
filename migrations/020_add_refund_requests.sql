create extension if not exists pgcrypto;

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payer_email text null,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by_user_email text null,
  stripe_refund_id text null,
  constraint refund_requests_status_check
    check (status in ('pending', 'approved', 'declined'))
);

create index if not exists idx_refund_requests_invoice_id
  on public.refund_requests (invoice_id);

create index if not exists idx_refund_requests_workspace_id
  on public.refund_requests (workspace_id);

create index if not exists idx_refund_requests_status
  on public.refund_requests (status);

create unique index if not exists idx_refund_requests_invoice_pending_unique
  on public.refund_requests (invoice_id)
  where status = 'pending';
