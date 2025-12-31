import { CheckIcon, ClockIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

export default function InvoiceStatus({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-1 text-xs',
        {
          'border-amber-400/50 bg-amber-500/15 text-amber-200':
            status === 'pending',
          'border-emerald-400/50 bg-emerald-500/20 text-emerald-200':
            status === 'paid',
        },
      )}
    >
      {status === 'pending' ? (
        <>
          Pending
          <ClockIcon className="ml-1 w-4 text-amber-200" />
        </>
      ) : null}
      {status === 'paid' ? (
        <>
          Paid
          <CheckIcon className="ml-1 w-4 text-emerald-200" />
        </>
      ) : null}
    </span>
  );
}
