import Link from 'next/link';

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
  const payNowButtonClasses =
    'pointer-events-auto relative z-10 inline-flex items-center justify-center rounded-xl border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-emerald-700 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-emerald-400/40 dark:bg-black dark:text-emerald-300 dark:hover:bg-emerald-500/10 dark:focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60';

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className={`${payNowButtonClasses} ${className ?? ''}`}
      >
        Pay now
      </button>
    );
  }

  return (
    <Link
      href={`/api/invoices/${invoiceId}/pay-link`}
      prefetch={false}
      className={`${payNowButtonClasses} ${className ?? ''}`}
      data-row-nav-stop
    >
      Pay now
    </Link>
  );
}
