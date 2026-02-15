import clsx from 'clsx';
import { getInvoiceStatusDisplay } from '@/app/ui/invoices/status-map';

export default function InvoiceStatus({ status }: { status: string }) {
  const display = getInvoiceStatusDisplay(status);
  const Icon = display.Icon;

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        display.className,
      )}
    >
      {display.label}
      {Icon ? <Icon className={clsx('ml-1 w-4', display.iconClassName)} /> : null}
    </span>
  );
}
