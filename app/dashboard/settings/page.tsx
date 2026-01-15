import { Metadata } from 'next';
import UpgradeButton from './upgrade-button';
import ManageBillingButton from './manage-billing-button';
import { fetchCompanyProfile, fetchUserPlanAndUsage } from '@/app/lib/data';
import CompanyProfileForm from './company-profile-form';
import { PLAN_CONFIG, type PlanId } from '@/app/lib/config';

export const metadata: Metadata = {
  title: 'Settings',
};

export default async function SettingsPage(props: {
  searchParams?: Promise<{ success?: string; canceled?: string }>;
}) {
  const searchParams = await props.searchParams;
  const success = searchParams?.success === '1';
  const canceled = searchParams?.canceled === '1';

  function formatEtDateTime(value: Date | string | null | undefined) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;

    return new Intl.DateTimeFormat('et-EE', {
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
  const periodEndLabel = formatEtDateTime(currentPeriodEnd);
  const planConfig = PLAN_CONFIG[plan];
  const isUnlimited = !Number.isFinite(planConfig.maxPerMonth);
  const previewYear = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
  }).format(new Date());
  const invoiceNumberPreview = `INV-${previewYear}-0001`;

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

      {/* Checkout success / cancel teated */}
      {success && (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
          Payment successful. Your plan is updated.
        </div>
      )}

      {canceled && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          Payment canceled.
        </div>
      )}

      {/* Plan + limiit info */}
      <div className="mb-4 rounded-md border border-slate-800 bg-slate-900/80 p-4">
        <p className="mb-2 text-sm text-slate-300">
          Plan:{' '}
          <span
            className={
              plan !== 'free'
                ? 'inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-200'
                : 'inline-flex items-center rounded-full bg-slate-700/60 px-2 py-0.5 text-xs font-semibold text-slate-100'
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
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
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
              className="rounded-md border border-slate-800 bg-slate-900/80 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-100">
                      {planCard.title}
                    </h3>
                    {isCurrent && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-200">
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
                        ? 'rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-300'
                        : 'rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90'
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Billing portal */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ManageBillingButton />
      </div>

      <p className="mt-4 text-sm text-slate-400">
        Use “Manage billing / Cancel” to cancel your subscription, update
        payment method, or view invoices.
      </p>
    </div>
  );
}
