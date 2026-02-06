import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import UpgradeButton from './upgrade-button';
import ManageBillingButton from './manage-billing-button';
import {
  fetchCompanyProfile,
  fetchStripeConnectAccountId,
  fetchStripeConnectStatus,
  fetchUserPlanAndUsage,
  requireUserEmail,
  type StripeConnectStatus,
} from '@/app/lib/data';
import CompanyProfileForm from './company-profile-form';
import { PLAN_CONFIG, type PlanId } from '@/app/lib/config';
import { auth } from '@/auth';
import ConnectStripeButton from './connect-stripe-button';

export const metadata: Metadata = {
  title: 'Settings',
};

export default async function SettingsPage(props: {
  searchParams?: Promise<{ success?: string; canceled?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  const userEmail = await requireUserEmail();
  const searchParams = await props.searchParams;
  const success = searchParams?.success === '1';
  const canceled = searchParams?.canceled === '1';

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

  const {
    plan,
    isPro,
    subscriptionStatus,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    invoiceCount,
    maxPerMonth,
  } = await fetchUserPlanAndUsage();
  const companyProfile = await fetchCompanyProfile();
  const stripeConnectAccountId = await fetchStripeConnectAccountId();
  const connectStatus: StripeConnectStatus =
    await fetchStripeConnectStatus(userEmail);
  const periodEndLabel = formatEtDateTime(currentPeriodEnd);
  const planConfig = PLAN_CONFIG[plan];
  const isUnlimited = !Number.isFinite(planConfig.maxPerMonth);
  const previewYear = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
  }).format(new Date());
  const invoiceNumberPreview = `INV-${previewYear}-0001`;
  const connectStatusPill: {
    label: string;
    className: string;
  } | null = connectStatus
    ? connectStatus.payoutsEnabled
      ? {
          label: 'Payouts enabled',
          className: 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-200',
        }
      : {
          label: 'Payouts not enabled yet',
          className: 'border border-amber-500/30 bg-amber-500/20 text-amber-200',
        }
    : null;

  const planCards: Array<{
    id: Exclude<PlanId, 'free'>;
    title: string;
    price: string;
    highlight: string;
    description: string;
  }> = [
    {
      id: 'solo',
      title: 'Solo',
      price: '29€/month',
      highlight: 'Up to 50 invoices/month',
      description: 'For freelancers who want hands-off reminders.',
    },
    {
      id: 'pro',
      title: 'Pro',
      price: '59€/month',
      highlight: 'Up to 250 invoices/month',
      description: 'For growing teams with recurring clients.',
    },
    {
      id: 'studio',
      title: 'Studio',
      price: '99€/month',
      highlight: 'Unlimited invoices',
      description: 'For agencies managing multiple retainers.',
    },
  ];

  return (
    <div className="w-full max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold text-slate-100">Settings</h1>
      {/* TODO: Add email verification banner + resend action when user.is_verified is false. */}

      {/* Checkout success / cancel teated */}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
          Payment successful. Your plan is updated.
        </div>
      )}

      {canceled && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          Payment canceled.
        </div>
      )}

      {/* Plan + limiit info */}
      <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <p className="mb-2 text-sm text-slate-300">
          Plan:{' '}
          <span
            className={
              plan !== 'free'
                ? 'inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-200'
                : 'inline-flex items-center rounded-full border border-slate-600/60 bg-slate-700/40 px-2 py-0.5 text-xs font-semibold text-slate-100'
            }
          >
            {planConfig.name}
          </span>
        </p>

        {isUnlimited ? (
          <p className="text-sm text-slate-400">
            You can create unlimited invoices each month.
          </p>
        ) : (
          <p className="text-sm text-slate-400">
            This month: {invoiceCount} / {maxPerMonth} invoices used.
          </p>
        )}

        {subscriptionStatus && (
          <p className="mt-1 text-xs text-slate-500">
            Subscription status: {subscriptionStatus}
          </p>
        )}

        {plan !== 'free' && periodEndLabel && (
          <>
            {cancelAtPeriodEnd ? (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
                <p className="text-sm font-semibold">Cancellation scheduled</p>
                <p className="mt-1 text-sm text-amber-100/90">
                  Your access stays active until{' '}
                  <span className="font-semibold">{periodEndLabel}</span>.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Next renewal: {periodEndLabel}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mb-4">
        <CompanyProfileForm
          initialProfile={companyProfile}
          invoiceNumberPreview={invoiceNumberPreview}
        />
      </div>

      <div className="mb-6 space-y-3">
        {planCards.map((planCard) => {
          const isCurrent = plan === planCard.id && isPro;
          return (
            <div
              key={planCard.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-100">
                      {planCard.title}
                    </h3>
                    {isCurrent && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                        Current plan
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400">{planCard.description}</p>
                  <p className="mt-2 text-sm text-slate-300">
                    {planCard.highlight}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-xl font-semibold text-slate-100">
                    {planCard.price}
                  </p>
                  <UpgradeButton
                    plan={planCard.id}
                    label={isCurrent ? 'Current plan' : `Choose ${planCard.title}`}
                    disabled={isCurrent}
                    className={
                      isCurrent
                        ? 'rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-300'
                        : 'rounded-xl border border-sky-500/40 bg-sky-500/80 px-4 py-2 text-sm font-medium text-slate-950 transition duration-200 ease-out hover:bg-sky-400/90 hover:scale-[1.01]'
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!stripeConnectAccountId && (
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
          <p className="mb-3 text-sm text-slate-300">
            Connect your Stripe account to receive payouts directly.
          </p>
          <ConnectStripeButton />
        </div>
      )}

      {/* Billing portal */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ManageBillingButton />
      </div>

      <p className="mt-4 text-sm text-slate-400">
        Use “Manage billing / Cancel” to cancel your subscription, update
        payment method, or view invoices.
      </p>

      <div className="mt-6 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
        <h2 className="text-base font-semibold text-slate-100">Payouts</h2>

        {!connectStatus ? (
          <>
            <p className="text-sm text-slate-300">
              You haven&apos;t connected Stripe payouts yet.
            </p>
            <p className="text-xs text-slate-500">
              Connect Stripe above to start receiving payouts.
            </p>
            <Link
              href="/dashboard/settings/payouts"
              className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01]"
            >
              Learn more about payouts
            </Link>
          </>
        ) : (
          <>
            <div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${connectStatusPill?.className ?? ''}`}
              >
                {connectStatusPill?.label}
              </span>
            </div>
            <p className="text-sm text-slate-300">
              View your payout status and open the Stripe Express dashboard.
            </p>
            <Link
              href="/dashboard/settings/payouts"
              className="inline-flex items-center rounded-xl border border-sky-500/40 bg-sky-500/80 px-3 py-2 text-sm font-medium text-slate-950 transition duration-200 ease-out hover:bg-sky-400/90 hover:scale-[1.01]"
            >
              Open payouts
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
