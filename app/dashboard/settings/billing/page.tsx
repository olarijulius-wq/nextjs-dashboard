import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import UpgradeButton from '../upgrade-button';
import ManageBillingButton from '../manage-billing-button';
import BillingSelfCheckPanel from './billing-self-check-panel';
import {
  fetchStripeConnectStatusForUser,
  fetchUserPlanAndUsage,
  requireUserEmail,
  type StripeConnectStatus,
} from '@/app/lib/data';
import {
  BILLING_INTERVALS,
  getAnnualPriceDisplay,
  getAnnualSavingsLabel,
  PLAN_CONFIG,
  type BillingInterval,
  type PlanId,
} from '@/app/lib/config';
import { diagnosticsEnabled, isSettingsRemindersAdminEmail } from '@/app/lib/admin-gates';
import IntervalToggle from '@/app/ui/pricing/interval-toggle';
import PricingPanel from '@/app/ui/pricing/panel';
import { primaryButtonClasses, secondaryButtonClasses } from '@/app/ui/button';
import { CARD_INTERACTIVE } from '@/app/ui/theme/tokens';
import { logFunnelEvent } from '@/app/lib/funnel-events';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { getStripeConfigState } from '@/app/lib/stripe-guard';
import { readCanonicalWorkspacePlanSource } from '@/app/lib/billing-sync';
import {
  fetchLatestBillingEventForWorkspace,
  fetchWorkspaceDunningState,
  normalizeBillingStatus,
} from '@/app/lib/billing-dunning';
import SendRecoveryEmailButton from './send-recovery-email-button';
import BillingSyncToast from './billing-sync-toast';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const metadata: Metadata = {
  title: 'Billing Settings',
};

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && error.message === 'Unauthorized';
}

function formatEtDateTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Tallinn',
  }).format(d);
}

function formatRelativeTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const absMinutes = Math.abs(diffMinutes);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absMinutes < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) {
    return formatter.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, 'day');
}

function normalizePlanId(value: string | null | undefined): PlanId | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'free' || normalized === 'solo' || normalized === 'pro' || normalized === 'studio') {
    return normalized as PlanId;
  }
  return null;
}

export default async function BillingSettingsPage(props: {
  searchParams?: Promise<{
    success?: string;
    canceled?: string;
    session_id?: string;
    interval?: string;
    plan?: string;
  }>;
}) {
  const userEmail = await (async () => {
    try {
      return await requireUserEmail();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        redirect('/login?callbackUrl=/dashboard/settings/billing');
      }
      throw error;
    }
  })();

  const workspaceContext = await (async () => {
    try {
      return await ensureWorkspaceContextForCurrentUser();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        redirect('/login?callbackUrl=/dashboard/settings/billing');
      }
      throw error;
    }
  })();

  const searchParams = await props.searchParams;
  const success = searchParams?.success === '1';
  const canceled = searchParams?.canceled === '1';
  const sessionId = searchParams?.session_id?.trim() || null;
  const requestedInterval = searchParams?.interval?.trim().toLowerCase();
  const interval: BillingInterval = BILLING_INTERVALS.includes(
    requestedInterval as BillingInterval,
  )
    ? (requestedInterval as BillingInterval)
    : 'monthly';

  const nextMonthlyParams = new URLSearchParams();
  const nextAnnualParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (!value) continue;
    nextMonthlyParams.set(key, value);
    nextAnnualParams.set(key, value);
  }
  nextMonthlyParams.set('interval', 'monthly');
  nextAnnualParams.set('interval', 'annual');
  const monthlyHref = `/dashboard/settings/billing?${nextMonthlyParams.toString()}`;
  const annualHref = `/dashboard/settings/billing?${nextAnnualParams.toString()}`;

  await logFunnelEvent({
    userEmail,
    eventName: 'billing_opened',
    source: 'billing',
  });

  const {
    plan: userPlan,
    subscriptionStatus,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    invoiceCount,
  } = await (async () => {
    try {
      return await fetchUserPlanAndUsage();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        redirect('/login?callbackUrl=/dashboard/settings/billing');
      }
      throw error;
    }
  })();
  const connectStatus: StripeConnectStatus =
    await fetchStripeConnectStatusForUser(userEmail);
  const planSource = await readCanonicalWorkspacePlanSource({
    workspaceId: workspaceContext.workspaceId,
    userId: workspaceContext.userId,
  });
  const plan = normalizePlanId(planSource.value) ?? userPlan;
  const hasWorkspaceAdminRole =
    workspaceContext.userRole === 'owner' || workspaceContext.userRole === 'admin';
  const canViewInternalBillingDebug = isInternalAdmin(workspaceContext.userEmail);
  const canRunSelfCheck = hasWorkspaceAdminRole && canViewInternalBillingDebug;
  const showPlanSourceDiagnostics =
    diagnosticsEnabled() && isSettingsRemindersAdminEmail(userEmail);
  const [dunningState, latestBillingEvent] = await Promise.all([
    fetchWorkspaceDunningState(workspaceContext.workspaceId),
    fetchLatestBillingEventForWorkspace(workspaceContext.workspaceId),
  ]);
  const stripeState = getStripeConfigState();
  const latestWebhook = canRunSelfCheck
    ? (
        await sql<{
          event_id: string;
          event_type: string;
          status: string;
          processed_at: Date | null;
          received_at: Date;
          error: string | null;
        }[]>`
          select
            event_id,
            event_type,
            status,
            processed_at,
            received_at,
            error
          from public.stripe_webhook_events
          order by received_at desc
          limit 1
        `
      )[0]
    : null;

  const periodEndLabel = formatEtDateTime(currentPeriodEnd);
  const paymentStatus = normalizeBillingStatus(
    dunningState?.subscriptionStatus ?? subscriptionStatus,
  );
  const recoveryRequired = Boolean(dunningState?.recoveryRequired);
  const billingPortalLabel = recoveryRequired ? 'Fix payment' : 'Open billing portal';
  const lastPaymentFailureLabel = formatEtDateTime(dunningState?.lastPaymentFailureAt);
  const latestBillingEventRelative = formatRelativeTime(latestBillingEvent?.createdAt);
  const planConfig = PLAN_CONFIG[plan];
  const isPro = plan !== 'free';
  const isUnlimited = !Number.isFinite(planConfig.maxPerMonth);
  const connectStatusPill: {
    label: string;
    className: string;
  } | null =
    connectStatus.isReadyForTransfers
      ? {
          label: 'Payouts active',
          className:
            'border border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
        }
      : connectStatus.hasAccount
        ? {
            label: 'Connected, verification pending',
            className: 'border border-amber-500/35 bg-amber-500/10 text-amber-200',
          }
        : null;

  const planCards: Array<{
    id: Exclude<PlanId, 'free'>;
    title: string;
    highlight: string;
    description: string;
  }> = [
    {
      id: 'solo',
      title: 'Solo',
      highlight: 'Up to 50 invoices/month',
      description: 'For freelancers who want hands-off reminders.',
    },
    {
      id: 'pro',
      title: 'Pro',
      highlight: 'Up to 250 invoices/month',
      description: 'For growing teams with recurring clients.',
    },
    {
      id: 'studio',
      title: 'Studio',
      highlight: 'Unlimited invoices',
      description: 'For agencies managing multiple retainers.',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <BillingSyncToast enabled={success && !!sessionId} sessionId={sessionId} />
      {success && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200">
          Payment successful. {sessionId ? 'Verifying plan sync...' : ''}
        </div>
      )}

      {canceled && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
          Payment canceled.
        </div>
      )}

      <PricingPanel className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-neutral-400">
              Current plan
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
              {planConfig.name}
            </h2>
          </div>
          <span className="inline-flex items-center rounded-full border border-neutral-900 bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white dark:border-neutral-700 dark:text-neutral-100">
            {plan === 'free' ? 'No active subscription' : 'Subscription active'}
          </span>
        </div>

        {isUnlimited ? (
          <p className="text-sm text-slate-600 dark:text-neutral-300">
            You can create unlimited invoices each month.
          </p>
        ) : (
          <p className="text-sm text-slate-600 dark:text-neutral-300">
            This month: {invoiceCount} / {planConfig.maxPerMonth} invoices used.
          </p>
        )}

        {showPlanSourceDiagnostics ? (
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            Plan source: {planSource.source}={planSource.value ?? 'null'} (workspaceId=
            {workspaceContext.workspaceId})
          </p>
        ) : null}

        {canViewInternalBillingDebug && subscriptionStatus && (
          <p className="text-xs text-slate-500 dark:text-neutral-500">
            Subscription status: {subscriptionStatus}
          </p>
        )}

        {plan !== 'free' && periodEndLabel && (
          <>
            {cancelAtPeriodEnd ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
                <p className="font-semibold text-amber-950 dark:text-amber-200">Cancellation scheduled</p>
                <p className="mt-1">
                  Your access stays active until{' '}
                  <span className="font-semibold">{periodEndLabel}</span>.
                </p>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">Next renewal: {periodEndLabel}</p>
            )}
          </>
        )}
      </PricingPanel>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Choose your plan</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
              Switch between monthly and annual billing anytime.
            </p>
          </div>
          <IntervalToggle
            interval={interval}
            monthlyHref={monthlyHref}
            annualHref={annualHref}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {recoveryRequired ? (
            <div className="md:col-span-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
              Payment recovery required. You can still review plans, but fix the billing issue first to avoid service interruptions.
            </div>
          ) : null}
          {planCards.map((planCard) => {
            const isCurrent = plan === planCard.id;
            const isAnnual = interval === 'annual';

            return (
              <PricingPanel
                key={planCard.id}
                className={`flex h-full flex-col p-5 ${CARD_INTERACTIVE} dark:hover:border-neutral-700 dark:hover:shadow-[0_24px_42px_rgba(0,0,0,0.48)]`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">{planCard.title}</p>
                  {isCurrent ? (
                    <span className="rounded-full border border-neutral-900 bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white dark:border-neutral-600 dark:text-neutral-200">
                      Current plan
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">
                  €
                  {isAnnual
                    ? getAnnualPriceDisplay(planCard.id)
                    : PLAN_CONFIG[planCard.id].priceMonthlyEuro}
                  <span className="text-sm font-normal text-slate-500 dark:text-neutral-400">
                    {isAnnual ? ' / year' : ' / month'}
                  </span>
                </p>

                {isAnnual ? (
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-emerald-300">
                    {getAnnualSavingsLabel(planCard.id)}
                  </p>
                ) : (
                  <div className="mt-1 h-4" />
                )}

                <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-neutral-300">
                  {planCard.description}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-neutral-200">{planCard.highlight}</p>

                <div className="mt-6">
                  <UpgradeButton
                    plan={planCard.id}
                    interval={interval}
                    label={isCurrent ? 'Current plan' : `Choose ${planCard.title}`}
                    disabled={isCurrent}
                    className={
                      isCurrent
                        ? 'inline-flex w-full items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400'
                        : `${primaryButtonClasses} w-full rounded-full`
                    }
                  />
                </div>
              </PricingPanel>
            );
          })}
        </div>
      </section>

      <PricingPanel className="space-y-3">
        {recoveryRequired ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
            Billing warning: resolve your failed payment before making plan changes.
          </p>
        ) : null}
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Manage billing</h3>
        <p className="text-sm text-slate-600 dark:text-neutral-300">
          Open Stripe billing to update payment details, cancel, or view invoice history.
        </p>
        <ManageBillingButton label={billingPortalLabel} />
      </PricingPanel>

      {canViewInternalBillingDebug ? (
        <PricingPanel className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Payment status</h3>
          <div className="grid gap-2 text-sm text-slate-700 dark:text-neutral-300">
            <p>
              Subscription status:{' '}
              <span className="font-medium text-slate-900 dark:text-neutral-100">
                {paymentStatus}
              </span>
            </p>
            <p>
              Recovery required:{' '}
              <span className="font-medium text-slate-900 dark:text-neutral-100">
                {recoveryRequired ? 'yes' : 'no'}
              </span>
            </p>
            {lastPaymentFailureLabel ? (
              <p>
                Last payment failure:{' '}
                <span className="font-medium text-slate-900 dark:text-neutral-100">
                  {lastPaymentFailureLabel}
                </span>
              </p>
            ) : null}
            {latestBillingEvent ? (
              <p>
                Latest billing event:{' '}
                <span className="font-medium text-slate-900 dark:text-neutral-100">
                  {latestBillingEvent.eventType}
                  {latestBillingEventRelative ? ` (${latestBillingEventRelative})` : ''}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {recoveryRequired && canRunSelfCheck ? <SendRecoveryEmailButton /> : null}
          </div>
          {canRunSelfCheck ? (
            <Link
              href="/dashboard/settings/billing-events"
              className={`${secondaryButtonClasses} w-fit rounded-full`}
            >
              Open billing events
            </Link>
          ) : null}
        </PricingPanel>
      ) : null}

      {canRunSelfCheck ? (
        <PricingPanel>
          <BillingSelfCheckPanel
            initialSnapshot={{
              environment: stripeState.environment,
              keyMode: stripeState.secretKeyMode,
              keySuffix: stripeState.secretKeyMasked,
              connectAccountId: connectStatus.accountId,
              latestWebhook: latestWebhook
                ? {
                    eventId: latestWebhook.event_id,
                    eventType: latestWebhook.event_type,
                    status: latestWebhook.status,
                    processedAt: latestWebhook.processed_at
                      ? latestWebhook.processed_at.toISOString()
                      : null,
                    receivedAt: latestWebhook.received_at.toISOString(),
                    error: latestWebhook.error,
                  }
                : null,
            }}
          />
        </PricingPanel>
      ) : null}

      <PricingPanel className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Stripe payouts</h3>

        {!connectStatus.hasAccount ? (
          <p className="text-sm text-slate-600 dark:text-neutral-300">
            You haven&apos;t connected Stripe payouts yet.
          </p>
        ) : (
          <>
            <div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${connectStatusPill?.className ?? ''}`}
              >
                {connectStatusPill?.label}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-neutral-300">
              {connectStatus.isReadyForTransfers
                ? 'Payouts are enabled. Open Stripe Express dashboard for payout activity.'
                : 'Stripe account connected, payouts pending verification in Stripe.'}
            </p>
          </>
        )}

        <Link
          href="/dashboard/settings/payouts"
          className={`${secondaryButtonClasses} w-fit rounded-full`}
        >
          Open payouts
        </Link>
      </PricingPanel>
    </div>
  );
}
