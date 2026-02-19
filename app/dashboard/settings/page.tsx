import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  fetchStripeConnectStatusForUser,
  requireUserEmail,
} from '@/app/lib/data';
import { primaryButtonClasses } from '@/app/ui/button';
import { RevealOnScroll } from '@/app/ui/motion/reveal';
import { NEUTRAL_FOCUS_RING_CLASSES } from '@/app/ui/dashboard/neutral-interaction';
import { CARD_INTERACTIVE, LIGHT_SURFACE } from '@/app/ui/theme/tokens';

export const metadata: Metadata = {
  title: 'Settings',
};

const settingCards = [
  {
    title: 'Usage',
    href: '/dashboard/settings/usage',
    description: 'Track workspace usage and plan limits.',
  },
  {
    title: 'Billing',
    href: '/dashboard/settings/billing',
    description: 'Manage plan, subscription, and Stripe billing.',
  },
  {
    title: 'Team',
    href: '/dashboard/settings/team',
    description: 'Invite teammates and manage roles.',
  },
  {
    title: 'Company profile',
    href: '/dashboard/settings/company-profile',
    description: 'Manage team billing identity, logo, and invoice footer.',
  },
  {
    title: 'SMTP',
    href: '/dashboard/settings/smtp',
    description: 'Configure custom email provider integrations.',
  },
  {
    title: 'Unsubscribe',
    href: '/dashboard/settings/unsubscribe',
    description: 'Set unsubscribe pages and email preferences.',
  },
  {
    title: 'Reminders admin',
    href: '/dashboard/settings/reminders',
    description: 'Run reminders manually and inspect run logs.',
  },
  {
    title: 'Documents',
    href: '/dashboard/settings/documents',
    description: 'Document templates and storage configuration.',
  },
  {
    title: 'Refund requests',
    href: '/dashboard/settings/refunds',
    description: 'Review and process payer refund requests.',
  },
];

export default async function SettingsPage(props: {
  searchParams?: Promise<{
    success?: string;
    canceled?: string;
    plan?: string;
    interval?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const hasBillingParams =
    searchParams?.success ||
    searchParams?.canceled ||
    searchParams?.plan ||
    searchParams?.interval;

  if (hasBillingParams) {
    const params = new URLSearchParams();
    if (searchParams?.success) params.set('success', searchParams.success);
    if (searchParams?.canceled) params.set('canceled', searchParams.canceled);
    if (searchParams?.plan) params.set('plan', searchParams.plan);
    if (searchParams?.interval) params.set('interval', searchParams.interval);
    redirect(`/dashboard/settings/billing?${params.toString()}`);
  }

  const userEmail = await requireUserEmail();
  const connectStatus = await fetchStripeConnectStatusForUser(userEmail);
  const payoutsBadge = connectStatus.isReadyForTransfers
    ? {
        label: 'Payouts enabled',
        className:
          'border border-emerald-300 bg-emerald-200 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
      }
    : connectStatus.hasAccount
      ? {
          label: 'Not fully enabled',
          className:
            'border border-amber-300 bg-amber-200 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
        }
      : {
          label: 'No account',
          className:
            'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-300',
        };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${LIGHT_SURFACE} dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]`}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Payouts
        </h2>
        <div className="mt-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${payoutsBadge.className}`}
          >
            {payoutsBadge.label}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {connectStatus.isReadyForTransfers
            ? 'Payouts enabled. You can receive payouts to your connected Stripe account.'
            : connectStatus.hasAccount
              ? 'Connect account created, but payouts not fully enabled yet.'
              : 'No Connect account yet.'}
        </p>
        <Link
          href="/dashboard/settings/payouts"
          className={`${primaryButtonClasses} mt-4 px-3 py-2`}
        >
          Open payouts
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
      {settingCards.map((card, index) => (
        <RevealOnScroll key={card.href} delay={index * 0.04}>
          <Link
            href={card.href}
            className={`group block rounded-2xl border p-5 ${LIGHT_SURFACE} ${CARD_INTERACTIVE} dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)] dark:hover:border-neutral-700 dark:hover:shadow-[0_26px_44px_rgba(0,0,0,0.55)] dark:focus-visible:border-neutral-700 dark:focus-visible:shadow-[0_26px_44px_rgba(0,0,0,0.55)] ${NEUTRAL_FOCUS_RING_CLASSES}`}
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {card.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {card.description}
            </p>
          </Link>
        </RevealOnScroll>
      ))}
      </div>
    </div>
  );
}
