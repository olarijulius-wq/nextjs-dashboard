'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormattedCustomersTable } from '@/app/lib/definitions';
import { DeleteCustomer, UpdateCustomer } from '@/app/ui/customers/buttons';
import InvoiceStatus from '@/app/ui/invoices/status';
import { DARK_SURFACE_SUBTLE } from '@/app/ui/theme/tokens';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

function InitialAvatar({ name }: { name: string }) {
  const initial = (name?.trim()?.charAt(0) || '?').toUpperCase();
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white dark:border dark:border-zinc-800 dark:bg-black dark:text-zinc-100">
      {initial}
    </div>
  );
}

export default function CustomersTable({
  customers,
  highlightedCustomerId,
  returnToPath,
}: {
  customers: FormattedCustomersTable[];
  highlightedCustomerId?: string;
  returnToPath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!highlightedCustomerId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('highlight') === highlightedCustomerId) {
        params.delete('highlight');
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      }
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [highlightedCustomerId, pathname, router]);

  return (
    <div className="mt-6 flow-root">
      <div className="overflow-x-auto overflow-y-visible">
        <div className="inline-block min-w-full align-middle">
          <div className={`overflow-visible rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_12px_24px_rgba(15,23,42,0.06)] md:pt-0 ${DARK_SURFACE_SUBTLE} dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]`}>
            <div className="md:hidden">
              {customers?.map((customer) => {
                const isHighlighted = highlightedCustomerId === customer.id;
                return (
                <div
                  key={customer.id}
                  className={`mb-2 w-full rounded-xl border border-neutral-200 bg-white p-4 transition duration-300 ${DARK_SURFACE_SUBTLE} ${
                    isHighlighted
                      ? 'ring-2 ring-emerald-300/80 bg-emerald-50/60 dark:ring-emerald-500/60 dark:bg-emerald-500/10'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-zinc-900">
                    <div className="min-w-0">
                      <div className="mb-2 flex items-center">
                        <div className="flex items-center gap-3">
                          {customer.image_url ? (
                            <Image
                              src={customer.image_url}
                              className="rounded-full"
                              alt={`${customer.name}'s profile picture`}
                              width={28}
                              height={28}
                            />
                          ) : (
                            <InitialAvatar name={customer.name} />
                          )}
                          <Link
                            href={`/dashboard/customers/${customer.id}`}
                            className="truncate text-slate-900 hover:text-slate-700 dark:text-zinc-100 dark:hover:text-zinc-300"
                          >
                            {customer.name}
                          </Link>
                        </div>
                      </div>
                      <p className="truncate text-xs text-slate-600 dark:text-zinc-400">
                        {customer.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex w-full items-center justify-between border-b border-neutral-200 py-5 dark:border-zinc-900">
                    <div className="flex w-1/2 flex-col">
                      <InvoiceStatus status="pending" />
                      <p className="mt-1 text-sm font-medium text-amber-800 dark:text-zinc-200">
                        {customer.total_pending}
                      </p>
                    </div>
                    <div className="flex w-1/2 flex-col">
                      <InvoiceStatus status="paid" />
                      <p className="mt-1 text-sm font-medium text-emerald-800 dark:text-zinc-200">
                        {customer.total_paid}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 text-sm text-slate-900 dark:text-zinc-100">
                    <p>{customer.total_invoices} invoices</p>
                    <div className="flex justify-end gap-2">
                      <UpdateCustomer id={customer.id} returnTo={returnToPath} />
                      <DeleteCustomer id={customer.id} />
                    </div>
                  </div>
                </div>
              )})}
            </div>

            <table className="hidden min-w-full rounded-md text-slate-900 dark:text-zinc-100 md:table">
              <thead className="rounded-md bg-black text-left text-xs font-semibold uppercase tracking-[0.12em] text-white dark:bg-black dark:text-zinc-100">
                <tr>
                  <th scope="col" className="px-4 py-5 font-medium sm:pl-6">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Email
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Total Invoices
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Total Pending
                  </th>
                  <th scope="col" className="px-4 py-5 font-medium">
                    Total Paid
                  </th>
                  <th scope="col" className="px-4 py-5 font-medium text-center">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-200 text-slate-700 dark:divide-zinc-900 dark:text-zinc-200">
                {customers.map((customer) => {
                  const isHighlighted = highlightedCustomerId === customer.id;
                  return (
                  <tr
                    key={customer.id}
                    className={`group transition hover:bg-slate-50 dark:hover:bg-zinc-950 ${
                      isHighlighted
                        ? 'bg-emerald-50/70 ring-2 ring-inset ring-emerald-300/80 dark:bg-emerald-500/10 dark:ring-emerald-500/60'
                        : ''
                    }`}
                  >
                    <td className="whitespace-nowrap py-5 pl-4 pr-3 text-sm text-slate-900 dark:text-zinc-100 group-first-of-type:rounded-xl group-last-of-type:rounded-xl sm:pl-6">
                      <div className="flex items-center gap-3">
                        {customer.image_url ? (
                          <Image
                            src={customer.image_url}
                            className="rounded-full"
                            alt={`${customer.name}'s profile picture`}
                            width={28}
                            height={28}
                          />
                        ) : (
                          <InitialAvatar name={customer.name} />
                        )}
                        <Link
                          href={`/dashboard/customers/${customer.id}`}
                          className="hover:text-slate-700 dark:hover:text-zinc-300"
                        >
                          {customer.name}
                        </Link>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-sm text-slate-700 dark:text-zinc-300">
                      {customer.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-sm text-slate-700 dark:text-zinc-300">
                      {customer.total_invoices}
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-sm">
                      <div className="flex flex-col items-start gap-1">
                        <InvoiceStatus status="pending" />
                        <span>{customer.total_pending}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-sm text-emerald-800 dark:text-zinc-200 group-first-of-type:rounded-xl group-last-of-type:rounded-xl">
                      <div className="flex flex-col items-start gap-1">
                        <InvoiceStatus status="paid" />
                        <span>{customer.total_paid}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-center text-sm text-slate-700 dark:text-zinc-200">
                      <div className="flex justify-center gap-3">
                        <UpdateCustomer id={customer.id} returnTo={returnToPath} />
                        <DeleteCustomer id={customer.id} />
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>

            {customers.length === 0 && (
              <div className="p-6 text-sm text-slate-600 dark:text-zinc-300">No customers yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
