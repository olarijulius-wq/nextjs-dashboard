import {
  UserGroupIcon,
  HomeIcon,
  DocumentDuplicateIcon,
  Cog6ToothIcon,
  ClockIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

export type DashboardNavLink = {
  name: string;
  href: string;
  icon: typeof HomeIcon;
  proOnly?: boolean;
};

const BASE_DASHBOARD_LINKS: DashboardNavLink[] = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  {
    name: 'Invoices',
    href: '/dashboard/invoices',
    icon: DocumentDuplicateIcon,
  },
  { name: 'Customers', href: '/dashboard/customers', icon: UserGroupIcon },
  { name: 'Late payers', href: '/dashboard/late-payers', icon: ClockIcon, proOnly: true },
  { name: 'Reminders', href: '/dashboard/reminders', icon: EnvelopeIcon, proOnly: true },
  { name: 'Settings', href: '/dashboard/settings', icon: Cog6ToothIcon },
];

const ADMIN_FEEDBACK_EMAIL = 'user@nextmail.com';

export function isFeedbackAdmin(userEmail?: string | null) {
  return (userEmail ?? '').trim().toLowerCase() === ADMIN_FEEDBACK_EMAIL;
}

export function getDashboardLinks(userEmail?: string | null): DashboardNavLink[] {
  const links = [...BASE_DASHBOARD_LINKS];

  if (isFeedbackAdmin(userEmail)) {
    links.push({
      name: 'Feedback',
      href: '/dashboard/feedback',
      icon: ChatBubbleLeftRightIcon,
    });
  }

  return links;
}
