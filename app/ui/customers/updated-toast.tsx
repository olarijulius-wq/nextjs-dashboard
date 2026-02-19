'use client';

import Link from 'next/link';
import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { secondaryButtonClasses, toolbarButtonClasses } from '@/app/ui/button';

type CustomersUpdatedToastProps = {
  visible: boolean;
  customerId?: string;
};

export default function CustomersUpdatedToast({
  visible,
  customerId,
}: CustomersUpdatedToastProps) {
  const pathname = usePathname();
  const router = useRouter();

  const clearToastParams = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete('updated');
    params.delete('updatedCustomer');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const timeout = window.setTimeout(() => {
      clearToastParams();
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [clearToastParams, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-50 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-[0_14px_28px_rgba(15,23,42,0.14)] dark:border-neutral-700 dark:bg-black">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">Customer updated.</p>
        {customerId ? (
          <Link
            href={`/dashboard/customers/${customerId}`}
            className={`${toolbarButtonClasses} h-8 px-3 text-xs`}
          >
            View
          </Link>
        ) : null}
        <button
          type="button"
          onClick={clearToastParams}
          className={`${secondaryButtonClasses} h-8 px-2 text-xs`}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
