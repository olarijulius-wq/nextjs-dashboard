import { CheckIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { ComponentType, SVGProps } from 'react';
import { DARK_PILL } from '@/app/ui/theme/tokens';

export const KNOWN_INVOICE_STATUSES = [
  'pending',
  'paid',
  'overdue',
  'refunded',
  'partially_refunded',
  'disputed',
  'failed',
  'lost',
  'void',
  'cancelled',
  'canceled',
] as const;

export type KnownInvoiceStatus = (typeof KNOWN_INVOICE_STATUSES)[number];

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type StatusDisplay = {
  label: string;
  className: string;
  iconClassName?: string;
  Icon?: IconType;
};

const STATUS_DISPLAY: Record<KnownInvoiceStatus, StatusDisplay> = {
  pending: {
    label: 'Pending',
    className:
      'border-amber-500 bg-amber-500 text-black dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200',
    iconClassName: 'text-amber-700 dark:text-amber-400',
    Icon: ClockIcon,
  },
  paid: {
    label: 'Paid',
    className:
      'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200',
    iconClassName: 'text-emerald-100 dark:text-emerald-400',
    Icon: CheckIcon,
  },
  overdue: {
    label: 'Overdue',
    className:
      'border-rose-600 bg-rose-600 text-white dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200',
    iconClassName: 'text-rose-100 dark:text-rose-300',
    Icon: ExclamationTriangleIcon,
  },
  refunded: {
    label: 'Refunded',
    className:
      'border-sky-600 bg-sky-600 text-white dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200',
  },
  partially_refunded: {
    label: 'Partially refunded',
    className:
      'border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-200',
  },
  disputed: {
    label: 'Disputed',
    className:
      'border-fuchsia-600 bg-fuchsia-600 text-white dark:border-fuchsia-500/30 dark:bg-fuchsia-500/15 dark:text-fuchsia-200',
  },
  failed: {
    label: 'Failed',
    className:
      'border-rose-700 bg-rose-700 text-white dark:border-rose-600/30 dark:bg-rose-600/15 dark:text-rose-200',
  },
  lost: {
    label: 'Lost',
    className:
      'border-zinc-700 bg-zinc-700 text-white dark:border-zinc-600/30 dark:bg-zinc-600/15 dark:text-zinc-200',
  },
  void: {
    label: 'Void',
    className:
      'border-zinc-500 bg-zinc-500 text-white dark:border-zinc-500/30 dark:bg-zinc-500/15 dark:text-zinc-200',
  },
  cancelled: {
    label: 'Cancelled',
    className:
      'border-zinc-500 bg-zinc-500 text-white dark:border-zinc-500/30 dark:bg-zinc-500/15 dark:text-zinc-200',
  },
  canceled: {
    label: 'Canceled',
    className:
      'border-zinc-500 bg-zinc-500 text-white dark:border-zinc-500/30 dark:bg-zinc-500/15 dark:text-zinc-200',
  },
};

export function isKnownInvoiceStatus(status: string): status is KnownInvoiceStatus {
  return (KNOWN_INVOICE_STATUSES as readonly string[]).includes(status);
}

function capitalizeRawStatus(status: string): string {
  const trimmed = status.trim();
  if (!trimmed) return 'Unknown';
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function getInvoiceStatusDisplay(status: string): StatusDisplay {
  if (isKnownInvoiceStatus(status)) {
    return STATUS_DISPLAY[status];
  }

  return {
    label: capitalizeRawStatus(status),
    className: DARK_PILL,
  };
}
