create table if not exists public.workspace_billing (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  plan text not null default 'free',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_billing_stripe_customer_id
  on public.workspace_billing (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_workspace_billing_stripe_subscription_id
  on public.workspace_billing (stripe_subscription_id)
  where stripe_subscription_id is not null;

with ranked as (
  select
    w.id as workspace_id,
    u.stripe_customer_id,
    u.stripe_subscription_id,
    u.subscription_status,
    u.plan,
    u.current_period_end,
    u.cancel_at_period_end,
    row_number() over (
      partition by w.id
      order by
        (u.id = w.owner_user_id) desc,
        (
          u.stripe_customer_id is not null
          or u.stripe_subscription_id is not null
          or u.subscription_status is not null
          or u.current_period_end is not null
          or coalesce(u.cancel_at_period_end, false) = true
          or coalesce(u.plan, 'free') <> 'free'
        ) desc,
        u.id asc
    ) as rn
  from public.workspaces w
  left join public.users u
    on u.active_workspace_id = w.id
),
seeded as (
  select
    workspace_id,
    stripe_customer_id,
    stripe_subscription_id,
    subscription_status,
    coalesce(plan, 'free') as plan,
    current_period_end,
    coalesce(cancel_at_period_end, false) as cancel_at_period_end
  from ranked
  where rn = 1
)
insert into public.workspace_billing (
  workspace_id,
  stripe_customer_id,
  stripe_subscription_id,
  subscription_status,
  plan,
  current_period_end,
  cancel_at_period_end,
  updated_at
)
select
  s.workspace_id,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.subscription_status,
  s.plan,
  s.current_period_end,
  s.cancel_at_period_end,
  now()
from seeded s
on conflict (workspace_id) do update
set
  stripe_customer_id = coalesce(excluded.stripe_customer_id, workspace_billing.stripe_customer_id),
  stripe_subscription_id = coalesce(excluded.stripe_subscription_id, workspace_billing.stripe_subscription_id),
  subscription_status = coalesce(excluded.subscription_status, workspace_billing.subscription_status),
  plan = coalesce(excluded.plan, workspace_billing.plan),
  current_period_end = coalesce(excluded.current_period_end, workspace_billing.current_period_end),
  cancel_at_period_end = excluded.cancel_at_period_end,
  updated_at = now();
