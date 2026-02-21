'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  NEUTRAL_ACTIVE_ITEM_CLASSES,
  NEUTRAL_FOCUS_RING_CLASSES,
  NEUTRAL_INACTIVE_ITEM_CLASSES,
} from '@/app/ui/dashboard/neutral-interaction';
import {
  isLaunchCheckAdminEmail,
  isSettingsRemindersAdminEmail,
  isSmokeCheckAdminEmail,
} from '@/app/lib/admin-gates';

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
  { name: 'Email setup', href: '/dashboard/settings/smtp' },
  { name: 'Unsubscribe', href: '/dashboard/settings/unsubscribe' },
  { name: 'Documents', href: '/dashboard/settings/documents' },
];

const remindersSection = {
  name: 'Reminders',
  href: '/dashboard/settings/reminders',
};

export default function SettingsSectionsNav({
  canViewFunnel = false,
  diagnosticsEnabled = false,
  currentUserEmail,
  currentUserRole,
}: {
  canViewFunnel?: boolean;
  diagnosticsEnabled?: boolean;
  currentUserEmail?: string | null;
  currentUserRole?: 'owner' | 'admin' | 'member' | null;
}) {
  const pathname = usePathname();
  const canViewSettingsReminders = isSettingsRemindersAdminEmail(currentUserEmail);
  const hasWorkspaceAdminRole = currentUserRole === 'owner' || currentUserRole === 'admin';
  const canViewLaunchCheck = hasWorkspaceAdminRole && isLaunchCheckAdminEmail(currentUserEmail);
  const canViewSmokeCheck =
    hasWorkspaceAdminRole && isSmokeCheckAdminEmail(currentUserEmail);
  const canViewAllChecks =
    diagnosticsEnabled && canViewLaunchCheck && canViewSmokeCheck;

  const sections = canViewSettingsReminders
    ? [...baseSections, remindersSection]
    : baseSections;

  const withLaunchCheck = canViewLaunchCheck
    ? [...sections, { name: 'Launch readiness', href: '/dashboard/settings/launch-check' }]
    : sections;

  const withAllChecks = canViewAllChecks
    ? [...withLaunchCheck, { name: 'All checks', href: '/dashboard/settings/all-checks' }]
    : withLaunchCheck;

  const withSmokeCheck = diagnosticsEnabled && canViewSmokeCheck
    ? [...withAllChecks, { name: 'Smoke check', href: '/dashboard/settings/smoke-check' }]
    : withAllChecks;

  const withMigrations = diagnosticsEnabled && canViewSmokeCheck
    ? [...withSmokeCheck, { name: 'Migrations', href: '/dashboard/settings/migrations' }]
    : withSmokeCheck;

  const resolvedSections = canViewFunnel
    ? [...withMigrations, { name: 'Funnel', href: '/dashboard/settings/funnel' }]
    : withMigrations;

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
