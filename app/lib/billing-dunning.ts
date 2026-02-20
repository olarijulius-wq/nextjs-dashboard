import postgres from 'postgres';
import { sendBillingRecoveryEmail } from '@/app/lib/email';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const DAY_MS = 24 * 60 * 60 * 1000;

export type NormalizedBillingStatus =
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'trialing'
  | 'unknown';

export type DunningState = {
  workspaceId: string;
  userEmail: string | null;
  subscriptionStatus: NormalizedBillingStatus;
  lastPaymentFailureAt: Date | null;
  lastRecoveryEmailAt: Date | null;
  lastBannerDismissedAt: Date | null;
  recoveryRequired: boolean;
  updatedAt: Date;
};

type DunningStateRow = {
  workspace_id: string;
  user_email: string | null;
  subscription_status: string;
  last_payment_failure_at: Date | null;
  last_recovery_email_at: Date | null;
  last_banner_dismissed_at: Date | null;
  recovery_required: boolean;
  updated_at: Date;
};

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function normalizeBillingStatus(value: string | null | undefined): NormalizedBillingStatus {
  const raw = (value ?? '').trim().toLowerCase();

  if (raw === 'active') return 'active';
  if (raw === 'trialing') return 'trialing';
  if (raw === 'past_due') return 'past_due';
  if (raw === 'unpaid') return 'unpaid';
  if (raw === 'canceled' || raw === 'cancelled') return 'canceled';
  if (raw === 'incomplete' || raw === 'incomplete_expired' || raw === 'requires_action') {
    return 'incomplete';
  }

  return 'unknown';
}

export function isRecoveryRequiredStatus(status: NormalizedBillingStatus): boolean {
  return (
    status === 'past_due' ||
    status === 'unpaid' ||
    status === 'incomplete' ||
    status === 'canceled'
  );
}

function mapDunningRow(row: DunningStateRow): DunningState {
  return {
    workspaceId: row.workspace_id,
    userEmail: row.user_email,
    subscriptionStatus: normalizeBillingStatus(row.subscription_status),
    lastPaymentFailureAt: row.last_payment_failure_at,
    lastRecoveryEmailAt: row.last_recovery_email_at,
    lastBannerDismissedAt: row.last_banner_dismissed_at,
    recoveryRequired: row.recovery_required,
    updatedAt: row.updated_at,
  };
}

export async function fetchWorkspaceDunningState(
  workspaceId: string,
): Promise<DunningState | null> {
  const rows = await sql<DunningStateRow[]>`
    select
      workspace_id,
      user_email,
      subscription_status,
      last_payment_failure_at,
      last_recovery_email_at,
      last_banner_dismissed_at,
      recovery_required,
      updated_at
    from public.dunning_state
    where workspace_id = ${workspaceId}
    limit 1
  `;

  const row = rows[0];
  return row ? mapDunningRow(row) : null;
}

export function shouldShowDunningBanner(
  dunningState: DunningState | null,
  now: Date = new Date(),
): boolean {
  if (!dunningState?.recoveryRequired) return false;

  if (!dunningState.lastBannerDismissedAt) return true;

  return now.getTime() - dunningState.lastBannerDismissedAt.getTime() >= DAY_MS;
}

export async function dismissDunningBanner(workspaceId: string): Promise<void> {
  await sql`
    update public.dunning_state
    set
      last_banner_dismissed_at = now(),
      updated_at = now()
    where workspace_id = ${workspaceId}
  `;
}

export async function insertBillingEvent(input: {
  workspaceId?: string | null;
  userEmail?: string | null;
  eventType: string;
  stripeEventId?: string | null;
  stripeObjectId?: string | null;
  status?: string | null;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    insert into public.billing_events (
      workspace_id,
      user_email,
      event_type,
      stripe_event_id,
      stripe_object_id,
      status,
      meta
    )
    values (
      ${input.workspaceId ?? null},
      ${normalizeEmail(input.userEmail) ?? null},
      ${input.eventType},
      ${input.stripeEventId ?? null},
      ${input.stripeObjectId ?? null},
      ${input.status ?? null},
      ${sql.json((input.meta ?? {}) as any)}
    )
    on conflict do nothing
    returning id
  `;

  return rows.length > 0;
}

export async function upsertDunningStateFromStripeSignal(input: {
  workspaceId: string;
  userEmail?: string | null;
  status: string | null | undefined;
  paymentFailedSignal?: boolean;
  paymentSucceededSignal?: boolean;
}): Promise<{
  previous: DunningState | null;
  current: DunningState;
  transitionedIntoRecovery: boolean;
}> {
  const previous = await fetchWorkspaceDunningState(input.workspaceId);
  const normalizedStatus = normalizeBillingStatus(input.status);

  const shouldClearFailure =
    input.paymentSucceededSignal ||
    normalizedStatus === 'active' ||
    normalizedStatus === 'trialing';

  const recoveryRequired = shouldClearFailure
    ? false
    : isRecoveryRequiredStatus(normalizedStatus);

  let nextFailureAt: Date | null = previous?.lastPaymentFailureAt ?? null;

  if (shouldClearFailure) {
    nextFailureAt = null;
  } else if (input.paymentFailedSignal) {
    nextFailureAt = new Date();
  } else if (recoveryRequired && !previous?.recoveryRequired && !nextFailureAt) {
    nextFailureAt = new Date();
  }

  const rows = await sql<DunningStateRow[]>`
    insert into public.dunning_state (
      workspace_id,
      user_email,
      subscription_status,
      last_payment_failure_at,
      recovery_required,
      updated_at
    )
    values (
      ${input.workspaceId},
      ${normalizeEmail(input.userEmail) ?? null},
      ${normalizedStatus},
      ${nextFailureAt},
      ${recoveryRequired},
      now()
    )
    on conflict (workspace_id)
    do update set
      user_email = coalesce(excluded.user_email, public.dunning_state.user_email),
      subscription_status = excluded.subscription_status,
      last_payment_failure_at = excluded.last_payment_failure_at,
      recovery_required = excluded.recovery_required,
      updated_at = now()
    returning
      workspace_id,
      user_email,
      subscription_status,
      last_payment_failure_at,
      last_recovery_email_at,
      last_banner_dismissed_at,
      recovery_required,
      updated_at
  `;

  const current = mapDunningRow(rows[0]);

  return {
    previous,
    current,
    transitionedIntoRecovery: !Boolean(previous?.recoveryRequired) && current.recoveryRequired,
  };
}

function resolveBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}

async function resolveRecoveryRecipient(workspaceId: string): Promise<{
  ownerEmail: string;
  recipientEmail: string;
}> {
  const rows = await sql<{ owner_email: string; billing_email: string | null }[]>`
    select
      u.email as owner_email,
      cp.billing_email
    from public.workspaces w
    join public.users u on u.id = w.owner_user_id
    left join public.company_profiles cp on cp.workspace_id = w.id
    where w.id = ${workspaceId}
    limit 1
  `;

  const row = rows[0];
  const ownerEmail = normalizeEmail(row?.owner_email);

  if (!ownerEmail) {
    throw new Error('Workspace owner not found for billing recovery email.');
  }

  const billingEmail = normalizeEmail(row?.billing_email ?? null);
  const recipientEmail = billingEmail ?? ownerEmail;

  return { ownerEmail, recipientEmail };
}

export async function maybeSendRecoveryEmailForWorkspace(input: {
  workspaceId: string;
  force?: boolean;
}): Promise<{
  sent: boolean;
  skipped: boolean;
  reason?: string;
}> {
  const state = await fetchWorkspaceDunningState(input.workspaceId);

  if (!state?.recoveryRequired) {
    return { sent: false, skipped: true, reason: 'recovery_not_required' };
  }

  const now = new Date();
  if (!input.force && state.lastRecoveryEmailAt) {
    const elapsedMs = now.getTime() - state.lastRecoveryEmailAt.getTime();
    if (elapsedMs < DAY_MS) {
      return { sent: false, skipped: true, reason: 'rate_limited_24h' };
    }
  }

  const { recipientEmail, ownerEmail } = await resolveRecoveryRecipient(input.workspaceId);
  const billingUrl = `${resolveBaseUrl()}/dashboard/settings/billing`;

  await sendBillingRecoveryEmail({ to: recipientEmail, billingUrl });

  await sql`
    update public.dunning_state
    set
      last_recovery_email_at = now(),
      updated_at = now(),
      user_email = coalesce(user_email, ${ownerEmail})
    where workspace_id = ${input.workspaceId}
  `;

  await insertBillingEvent({
    workspaceId: input.workspaceId,
    userEmail: recipientEmail,
    eventType: 'recovery_email_sent',
    status: state.subscriptionStatus,
    meta: {
      recipientEmail,
    },
  });

  return { sent: true, skipped: false };
}

export async function logRecoveryEmailFailure(input: {
  workspaceId: string;
  userEmail?: string | null;
  error: string;
}): Promise<void> {
  await insertBillingEvent({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail ?? null,
    eventType: 'recovery_email_failed',
    status: null,
    meta: { error: input.error.slice(0, 1000) },
  });
}

export async function fetchLatestBillingEventForWorkspace(workspaceId: string): Promise<{
  eventType: string;
  status: string | null;
  createdAt: Date;
  meta: unknown;
} | null> {
  const rows = await sql<{
    event_type: string;
    status: string | null;
    created_at: Date;
    meta: unknown;
  }[]>`
    select event_type, status, created_at, meta
    from public.billing_events
    where workspace_id = ${workspaceId}
    order by created_at desc
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    eventType: row.event_type,
    status: row.status,
    createdAt: row.created_at,
    meta: row.meta,
  };
}
