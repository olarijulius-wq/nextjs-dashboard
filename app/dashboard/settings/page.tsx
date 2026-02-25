import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { RevealOnScroll } from '@/app/ui/motion/reveal';
import { NEUTRAL_FOCUS_RING_CLASSES } from '@/app/ui/dashboard/neutral-interaction';
import { CARD_INTERACTIVE, LIGHT_SURFACE } from '@/app/ui/theme/tokens';
import { buildSettingsSections } from '@/app/lib/settings-sections';

export const metadata: Metadata = {
  title: 'Settings',
};

const cardDescriptions: Record<string, string> = {
  '/dashboard/settings': 'Settings overview and quick access to all workspace configuration.',
  '/dashboard/settings/usage': 'Track workspace usage and plan limits.',
  '/dashboard/settings/billing': 'Manage plan, subscription, and Stripe billing.',
  '/dashboard/settings/pricing-fees': 'Review invoice fee model and platform fee settings.',
  '/dashboard/settings/payouts': 'Manage Stripe Connect payouts and account status.',
  '/dashboard/settings/refunds': 'Review and process payer refund requests.',
  '/dashboard/settings/team': 'Invite teammates and manage roles.',
  '/dashboard/settings/company-profile': 'Manage team billing identity, logo, and invoice footer.',
  '/dashboard/settings/smtp': 'Configure deliverability-safe sender identity and provider.',
  '/dashboard/settings/unsubscribe': 'Set unsubscribe pages and email preferences.',
  '/dashboard/settings/documents': 'Document templates and storage configuration.',
  '/dashboard/settings/billing-events': 'Inspect payment failures, recoveries, and portal activity.',
  '/dashboard/settings/launch-check': 'Run SEO, robots, and metadata launch checks.',
  '/dashboard/settings/all-checks': 'Run launch + smoke checks and copy a markdown report.',
  '/dashboard/settings/smoke-check': 'Run payments, email, webhook, schema, and env sanity checks.',
  '/dashboard/settings/migrations': 'Read-only migration tracking report for deploy safety.',
};

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

  const context = await ensureWorkspaceContextForCurrentUser();
  const sections = buildSettingsSections({
    userEmail: context.userEmail,
    userRole: context.userRole,
    diagnosticsEnabled: diagnosticsEnabled(),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((card, index) => (
          <RevealOnScroll key={card.href} delay={index * 0.04}>
            <Link
              href={card.href}
              className={`group block rounded-2xl border p-5 ${LIGHT_SURFACE} ${CARD_INTERACTIVE} dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)] dark:hover:border-neutral-700 dark:hover:shadow-[0_26px_44px_rgba(0,0,0,0.55)] dark:focus-visible:border-neutral-700 dark:focus-visible:shadow-[0_26px_44px_rgba(0,0,0,0.55)] ${NEUTRAL_FOCUS_RING_CLASSES}`}
            >
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {card.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {cardDescriptions[card.href] ?? 'Manage workspace settings.'}
              </p>
            </Link>
          </RevealOnScroll>
        ))}
      </div>
    </div>
  );
}
