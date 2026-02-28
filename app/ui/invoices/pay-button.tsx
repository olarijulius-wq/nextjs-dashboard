import Link from 'next/link';
import clsx from 'clsx';
import { primaryButtonClasses } from '@/app/ui/button';

type PayInvoiceButtonProps = {
  invoiceId: string;
  disabled?: boolean;
  className?: string;
};

export default function PayInvoiceButton({
  invoiceId,
  disabled = false,
  className,
}: PayInvoiceButtonProps) {
  const payNowButtonClasses = clsx(
    primaryButtonClasses,
    'pointer-events-auto relative z-10 h-9 whitespace-nowrap px-3 text-xs',
    className,
  );

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className={payNowButtonClasses}
      >
        Pay now
      </button>
    );
  }

  return (
    <Link
      href={`/api/invoices/${invoiceId}/pay-link`}
      prefetch={false}
      className={payNowButtonClasses}
      data-row-nav-stop
    >
      Pay now
    </Link>
  );
}
