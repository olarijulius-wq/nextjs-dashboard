import 'server-only';
import { sql } from '@/app/lib/db';
import { resolveEffectivePlan, type PlanId } from '@/app/lib/config';

const ALLOW_DEV_TEST_FALLBACK =
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

export type WorkspaceBillingContext = {
  workspaceId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  plan: PlanId;
  currentPeriodEnd: Date | string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: Date | string | null;
  source: 'workspace_billing' | 'users_fallback';
};

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePlan(value: string | null | undefined): PlanId {
  return resolveEffectivePlan(value ?? null, 'active');
}

async function readWorkspaceBillingRow(workspaceId: string) {
  const [row] = await sql<{
    workspace_id: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_status: string | null;
    plan: string | null;
    current_period_end: Date | string | null;
    cancel_at_period_end: boolean | null;
    updated_at: Date | string | null;
  }[]>`
    select
      workspace_id,
      stripe_customer_id,
      stripe_subscription_id,
      subscription_status,
      plan,
      current_period_end,
      cancel_at_period_end,
      updated_at
    from public.workspace_billing
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return row ?? null;
}

async function readLegacyUserBillingById(userId: string) {
  const [row] = await sql<{
    plan: string | null;
    subscription_status: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: Date | string | null;
    cancel_at_period_end: boolean | null;
  }[]>`
    select
      plan,
      subscription_status,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_end,
      cancel_at_period_end
    from public.users
    where id = ${userId}
    limit 1
  `;

  return row ?? null;
}

async function readLegacyUserBillingByEmail(userEmail: string) {
  const [row] = await sql<{
    id: string;
    plan: string | null;
    subscription_status: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: Date | string | null;
    cancel_at_period_end: boolean | null;
  }[]>`
    select
      id,
      plan,
      subscription_status,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_end,
      cancel_at_period_end
    from public.users
    where lower(email) = lower(${userEmail})
    limit 1
  `;

  return row ?? null;
}

function toContext(
  workspaceId: string,
  row: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    subscription_status: string | null;
    plan: string | null;
    current_period_end: Date | string | null;
    cancel_at_period_end: boolean | null;
    updated_at?: Date | string | null;
  },
  source: 'workspace_billing' | 'users_fallback',
): WorkspaceBillingContext {
  return {
    workspaceId,
    stripeCustomerId: normalizeText(row.stripe_customer_id),
    stripeSubscriptionId: normalizeText(row.stripe_subscription_id),
    subscriptionStatus: normalizeText(row.subscription_status),
    plan: normalizePlan(row.plan),
    currentPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    updatedAt: row.updated_at ?? null,
    source,
  };
}

export async function resolveBillingContext(
  input:
    | string
    | {
      workspaceId: string;
      userId?: string | null;
      userEmail?: string | null;
    },
): Promise<WorkspaceBillingContext> {
  const request = typeof input === 'string' ? { workspaceId: input } : input;
  const workspaceId = request.workspaceId.trim();
  if (!workspaceId) {
    return {
      workspaceId: '',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      plan: 'free',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: null,
      source: 'workspace_billing',
    };
  }

  const workspaceRow = await readWorkspaceBillingRow(workspaceId);
  if (workspaceRow) {
    return toContext(workspaceId, workspaceRow, 'workspace_billing');
  }

  if (!ALLOW_DEV_TEST_FALLBACK) {
    return {
      workspaceId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      plan: 'free',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: null,
      source: 'workspace_billing',
    };
  }

  const fallbackById = request.userId?.trim()
    ? await readLegacyUserBillingById(request.userId.trim())
    : null;
  const fallbackByEmail = !fallbackById && request.userEmail?.trim()
    ? await readLegacyUserBillingByEmail(request.userEmail.trim())
    : null;
  const fallbackRow = fallbackById ?? fallbackByEmail;

  if (!fallbackRow) {
    return {
      workspaceId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      plan: 'free',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: null,
      source: 'workspace_billing',
    };
  }

  console.warn('[workspace billing] fallback to users.* in non-production', {
    workspaceId,
    userId: request.userId ?? fallbackByEmail?.id ?? null,
    userEmail: request.userEmail ?? null,
  });

  return toContext(
    workspaceId,
    {
      stripe_customer_id: fallbackRow.stripe_customer_id,
      stripe_subscription_id: fallbackRow.stripe_subscription_id,
      subscription_status: fallbackRow.subscription_status,
      plan: fallbackRow.plan,
      current_period_end: fallbackRow.current_period_end,
      cancel_at_period_end: fallbackRow.cancel_at_period_end,
      updated_at: null,
    },
    'users_fallback',
  );
}

export async function upsertWorkspaceBilling(input: {
  workspaceId: string;
  plan: string | null;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean | null;
}): Promise<void> {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return;

  await sql`
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
    values (
      ${workspaceId},
      ${normalizeText(input.stripeCustomerId)},
      ${normalizeText(input.stripeSubscriptionId)},
      ${normalizeText(input.subscriptionStatus)},
      ${normalizePlan(input.plan)},
      ${input.currentPeriodEnd ?? null},
      ${input.cancelAtPeriodEnd ?? false},
      now()
    )
    on conflict (workspace_id) do update
    set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, public.workspace_billing.stripe_customer_id),
      stripe_subscription_id = coalesce(excluded.stripe_subscription_id, public.workspace_billing.stripe_subscription_id),
      subscription_status = coalesce(excluded.subscription_status, public.workspace_billing.subscription_status),
      plan = excluded.plan,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now()
  `;
}

export async function maybeLogBillingMirrorDrift(input: {
  workspaceId: string;
  userId?: string | null;
  userEmail?: string | null;
}): Promise<void> {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return;

  const [row] = await sql<{
    user_id: string;
    user_plan: string | null;
    user_subscription_status: string | null;
    user_stripe_customer_id: string | null;
    user_stripe_subscription_id: string | null;
    workspace_plan: string | null;
    workspace_subscription_status: string | null;
    workspace_stripe_customer_id: string | null;
    workspace_stripe_subscription_id: string | null;
  }[]>`
    with target_user as (
      select id
      from public.users
      where (
        (${input.userId?.trim() ?? null}::uuid is not null and id = ${input.userId?.trim() ?? null}::uuid)
        or (${input.userEmail?.trim() ?? null}::text is not null and lower(email) = lower(${input.userEmail?.trim() ?? null}::text))
      )
      and active_workspace_id = ${workspaceId}
      limit 1
    )
    select
      u.id as user_id,
      u.plan as user_plan,
      u.subscription_status as user_subscription_status,
      u.stripe_customer_id as user_stripe_customer_id,
      u.stripe_subscription_id as user_stripe_subscription_id,
      wb.plan as workspace_plan,
      wb.subscription_status as workspace_subscription_status,
      wb.stripe_customer_id as workspace_stripe_customer_id,
      wb.stripe_subscription_id as workspace_stripe_subscription_id
    from target_user tu
    join public.users u on u.id = tu.id
    left join public.workspace_billing wb on wb.workspace_id = ${workspaceId}
    limit 1
  `;

  if (!row) return;

  const differs =
    (row.user_plan ?? 'free') !== (row.workspace_plan ?? 'free') ||
    normalizeText(row.user_subscription_status) !== normalizeText(row.workspace_subscription_status) ||
    normalizeText(row.user_stripe_customer_id) !== normalizeText(row.workspace_stripe_customer_id) ||
    normalizeText(row.user_stripe_subscription_id) !== normalizeText(row.workspace_stripe_subscription_id);

  if (differs) {
    console.warn('[workspace billing] legacy users.* mirror drift detected', {
      workspaceId,
      userId: row.user_id,
      users: {
        plan: row.user_plan,
        subscriptionStatus: row.user_subscription_status,
        stripeCustomerId: row.user_stripe_customer_id,
        stripeSubscriptionId: row.user_stripe_subscription_id,
      },
      workspaceBilling: {
        plan: row.workspace_plan,
        subscriptionStatus: row.workspace_subscription_status,
        stripeCustomerId: row.workspace_stripe_customer_id,
        stripeSubscriptionId: row.workspace_stripe_subscription_id,
      },
    });
  }
}
