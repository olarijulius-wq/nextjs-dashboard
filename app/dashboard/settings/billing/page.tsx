import { Metadata } from 'next';
import Link from 'next/link';
import UpgradeButton from '../upgrade-button';
import ManageBillingButton from '../manage-billing-button';
import ConnectStripeButton from '../connect-stripe-button';
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
import IntervalToggle from '@/app/ui/pricing/interval-toggle';
import PricingPanel from '@/app/ui/pricing/panel';
import { primaryButtonClasses, secondaryButtonClasses } from '@/app/ui/button';
import { CARD_INTERACTIVE } from '@/app/ui/theme/tokens';
import { logFunnelEvent } from '@/app/lib/funnel-events';

export const metadata: Metadata = {
  title: 'Billing Settings',
};

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

export default async function BillingSettingsPage(props: {
  searchParams?: Promise<{
    success?: string;
    canceled?: string;
    interval?: string;
    plan?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const success = searchParams?.success === '1';
  const canceled = searchParams?.canceled === '1';
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

  const userEmail = await requireUserEmail();
  await logFunnelEvent({
    userEmail,
    eventName: 'billing_opened',
    source: 'billing',
  });

  const {
    plan,
    isPro,
    subscriptionStatus,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    invoiceCount,
    maxPerMonth,
  } = await fetchUserPlanAndUsage();
  const connectStatus: StripeConnectStatus =
    await fetchStripeConnectStatusForUser(userEmail);

  const periodEndLabel = formatEtDateTime(currentPeriodEnd);
  const planConfig = PLAN_CONFIG[plan];
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
      {success && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200">
          Payment successful. Your plan is updated.
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
            This month: {invoiceCount} / {maxPerMonth} invoices used.
          </p>
        )}

        {subscriptionStatus && (
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
          {planCards.map((planCard) => {
            const isCurrent = plan === planCard.id && isPro;
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
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Manage billing</h3>
        <p className="text-sm text-slate-600 dark:text-neutral-300">
          Open Stripe billing to update payment details, cancel, or view invoice history.
        </p>
        <ManageBillingButton label="Open billing portal" />
      </PricingPanel>

      {!connectStatus.hasAccount && (
        <PricingPanel className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Stripe payouts</h3>
          <p className="text-sm text-slate-600 dark:text-neutral-300">
            Connect your Stripe account to receive payouts directly.
          </p>
          <ConnectStripeButton />
        </PricingPanel>
      )}

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
