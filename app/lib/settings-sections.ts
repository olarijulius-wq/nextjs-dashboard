import 'server-only';

import type { WorkspaceRole } from '@/app/lib/workspaces';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

export type SettingsSection = {
  name: string;
  href: string;
  kind?: 'base' | 'internal';
};

type BuildSettingsSectionsInput = {
  userEmail: string | null | undefined;
  userRole: WorkspaceRole;
  diagnosticsEnabled?: boolean;
};

const BASE_SETTINGS_SECTIONS: SettingsSection[] = [
  { name: 'Overview', href: '/dashboard/settings', kind: 'base' },
  { name: 'Usage', href: '/dashboard/settings/usage', kind: 'base' },
  { name: 'Billing', href: '/dashboard/settings/billing', kind: 'base' },
  { name: 'Pricing & fees', href: '/dashboard/settings/pricing-fees', kind: 'base' },
  { name: 'Payouts', href: '/dashboard/settings/payouts', kind: 'base' },
  { name: 'Refunds', href: '/dashboard/settings/refunds', kind: 'base' },
  { name: 'Team', href: '/dashboard/settings/team', kind: 'base' },
  { name: 'Company profile', href: '/dashboard/settings/company-profile', kind: 'base' },
  { name: 'Email setup', href: '/dashboard/settings/smtp', kind: 'base' },
  { name: 'Unsubscribe', href: '/dashboard/settings/unsubscribe', kind: 'base' },
  { name: 'Documents', href: '/dashboard/settings/documents', kind: 'base' },
];

const INTERNAL_SETTINGS_SECTIONS: SettingsSection[] = [
  { name: 'Billing events', href: '/dashboard/settings/billing-events', kind: 'internal' },
  { name: 'Launch readiness', href: '/dashboard/settings/launch-check', kind: 'internal' },
  { name: 'All checks', href: '/dashboard/settings/all-checks', kind: 'internal' },
  { name: 'Smoke check', href: '/dashboard/settings/smoke-check', kind: 'internal' },
  { name: 'Migrations', href: '/dashboard/settings/migrations', kind: 'internal' },
];

export function buildSettingsSections(input: BuildSettingsSectionsInput): SettingsSection[] {
  const sections = [...BASE_SETTINGS_SECTIONS];
  if (!isInternalAdmin(input.userEmail)) {
    return sections;
  }
  return [...sections, ...INTERNAL_SETTINGS_SECTIONS];
}
