'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  NEUTRAL_ACTIVE_ITEM_CLASSES,
  NEUTRAL_FOCUS_RING_CLASSES,
  NEUTRAL_INACTIVE_ITEM_CLASSES,
} from '@/app/ui/dashboard/neutral-interaction';
import { isLaunchCheckAdminEmail, isSettingsRemindersAdminEmail } from '@/app/lib/admin-gates';

const baseSections = [
  { name: 'Overview', href: '/dashboard/settings' },
  { name: 'Usage', href: '/dashboard/settings/usage' },
  { name: 'Billing', href: '/dashboard/settings/billing' },
  { name: 'Billing events', href: '/dashboard/settings/billing-events' },
  { name: 'Pricing & Fees', href: '/dashboard/settings/pricing-fees' },
  { name: 'Payouts', href: '/dashboard/settings/payouts' },
  { name: 'Refunds', href: '/dashboard/settings/refunds' },
  { name: 'Team', href: '/dashboard/settings/team' },
  { name: 'Company', href: '/dashboard/settings/company-profile' },
  { name: 'SMTP', href: '/dashboard/settings/smtp' },
  { name: 'Unsubscribe', href: '/dashboard/settings/unsubscribe' },
  { name: 'Documents', href: '/dashboard/settings/documents' },
];

const remindersSection = {
  name: 'Reminders',
  href: '/dashboard/settings/reminders',
};

export default function SettingsSectionsNav({
  canViewFunnel = false,
  currentUserEmail,
}: {
  canViewFunnel?: boolean;
  currentUserEmail?: string | null;
}) {
  const pathname = usePathname();
  const canViewSettingsReminders = isSettingsRemindersAdminEmail(currentUserEmail);
  const canViewLaunchCheck = isLaunchCheckAdminEmail(currentUserEmail);

  const sections = canViewSettingsReminders
    ? [...baseSections, remindersSection]
    : baseSections;

  const withLaunchCheck = canViewLaunchCheck
    ? [...sections, { name: 'Launch readiness', href: '/dashboard/settings/launch-check' }]
    : sections;

  const resolvedSections = canViewFunnel
    ? [...withLaunchCheck, { name: 'Funnel', href: '/dashboard/settings/funnel' }]
    : withLaunchCheck;

  return (
    <div className="flex flex-wrap gap-2">
      {resolvedSections.map((section) => {
        const active = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            className={clsx(
              `inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition ${NEUTRAL_FOCUS_RING_CLASSES}`,
              active
                ? NEUTRAL_ACTIVE_ITEM_CLASSES
                : `border border-transparent ${NEUTRAL_INACTIVE_ITEM_CLASSES}`,
            )}
          >
            {section.name}
          </Link>
        );
      })}
    </div>
  );
}
