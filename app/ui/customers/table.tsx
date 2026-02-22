'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormattedCustomersTable } from '@/app/lib/definitions';
import { DeleteCustomer, UpdateCustomer } from '@/app/ui/customers/buttons';
import InvoiceStatus from '@/app/ui/invoices/status';
import { DARK_SURFACE_SUBTLE } from '@/app/ui/theme/tokens';
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react';
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
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

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

  function stopRowNavigation(event: SyntheticEvent) {
    // Keep action controls usable without triggering row navigation.
    event.stopPropagation();
  }

  function isFromInteractiveElement(target: EventTarget | null) {
    return target instanceof Element
      ? !!target.closest(
          'a,button,input,select,textarea,label,summary,[role="button"],[data-row-nav-stop]',
        )
      : false;
  }

  function hasSelectionText() {
    return (window.getSelection()?.toString().trim().length ?? 0) > 0;
  }

  function navigateToCustomer(customerId: string) {
    router.push(`/dashboard/customers/${customerId}?returnTo=${encodeURIComponent(returnToPath)}`);
  }

  function onRowPointerDown(event: PointerEvent<HTMLElement>) {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }

  function onRowClick(event: MouseEvent<HTMLElement>, customerId: string) {
    if (isFromInteractiveElement(event.target) || hasSelectionText()) return;

    const start = pointerDownRef.current;
    if (start) {
      const movedX = Math.abs(event.clientX - start.x);
      const movedY = Math.abs(event.clientY - start.y);
      if (movedX > 6 || movedY > 6) return;
    }

    navigateToCustomer(customerId);
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLElement>, customerId: string) {
    if (isFromInteractiveElement(event.target)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    navigateToCustomer(customerId);
  }

  return (
    <div className="mt-6 flow-root">
      <div className="overflow-x-auto overflow-y-visible">
        <div className="inline-block min-w-full align-middle">
          <div className={`overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_12px_24px_rgba(15,23,42,0.06)] md:pt-0 ${DARK_SURFACE_SUBTLE} dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]`}>
            <div className="md:hidden">
              {customers?.map((customer) => {
                const isHighlighted = highlightedCustomerId === customer.id;
                return (
                  <div
                    key={customer.id}
                    role="link"
                    tabIndex={0}
                    onPointerDown={onRowPointerDown}
                    onClick={(event) => onRowClick(event, customer.id)}
                    onKeyDown={(event) => onRowKeyDown(event, customer.id)}
                    className={`group mb-2 block w-full cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition duration-300 hover:border-neutral-300 hover:bg-slate-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-0 dark:hover:border-zinc-800 dark:hover:bg-zinc-950 dark:hover:shadow-black/20 dark:focus-visible:ring-2 dark:focus-visible:ring-zinc-700 ${DARK_SURFACE_SUBTLE} ${
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
                              href={`/dashboard/customers/${customer.id}?returnTo=${encodeURIComponent(returnToPath)}`}
                              onClick={stopRowNavigation}
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
                      <div
                        className="flex justify-end gap-2"
                        onClickCapture={stopRowNavigation}
                        onKeyDownCapture={stopRowNavigation}
                      >
                        <UpdateCustomer id={customer.id} returnTo={returnToPath} />
                        <DeleteCustomer id={customer.id} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block">
              <div className="grid grid-cols-[minmax(220px,1.2fr)_minmax(240px,1.4fr)_minmax(140px,0.8fr)_minmax(200px,1fr)_minmax(200px,1fr)_minmax(160px,0.8fr)] items-center px-4 py-5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-zinc-100">
                <div className="sm:pl-2">Name</div>
                <div>Email</div>
                <div>Total Invoices</div>
                <div>Total Pending</div>
                <div>Total Paid</div>
                <div className="text-right">Actions</div>
              </div>

              <div className="space-y-2">
                {customers.map((customer) => {
                  const isHighlighted = highlightedCustomerId === customer.id;
                  return (
                    <div
                      key={customer.id}
                      role="link"
                      tabIndex={0}
                      onPointerDown={onRowPointerDown}
                      onClick={(event) => onRowClick(event, customer.id)}
                      onKeyDown={(event) => onRowKeyDown(event, customer.id)}
                      className={`grid cursor-pointer grid-cols-[minmax(220px,1.2fr)_minmax(240px,1.4fr)_minmax(140px,0.8fr)_minmax(200px,1fr)_minmax(200px,1fr)_minmax(160px,0.8fr)] items-center rounded-xl border border-neutral-200 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm transition duration-300 hover:border-neutral-300 hover:bg-slate-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-0 dark:border-zinc-900 dark:hover:border-zinc-800 dark:hover:bg-zinc-950 dark:hover:shadow-black/20 dark:focus-visible:ring-2 dark:focus-visible:ring-zinc-700 ${DARK_SURFACE_SUBTLE} ${
                        isHighlighted
                          ? 'ring-2 ring-emerald-300/80 bg-emerald-50/60 dark:ring-emerald-500/60 dark:bg-emerald-500/10'
                          : ''
                      }`}
                    >
                      <div className="min-w-0 py-1 sm:pl-2">
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
                            href={`/dashboard/customers/${customer.id}?returnTo=${encodeURIComponent(returnToPath)}`}
                            onClick={stopRowNavigation}
                            className="truncate text-slate-900 hover:text-slate-700 dark:text-zinc-100 dark:hover:text-zinc-300"
                          >
                            {customer.name}
                          </Link>
                        </div>
                      </div>
                      <div className="min-w-0 truncate py-1 text-slate-700 dark:text-zinc-300">
                        {customer.email}
                      </div>
                      <div className="py-1 text-slate-700 dark:text-zinc-300">
                        {customer.total_invoices}
                      </div>
                      <div className="py-1">
                        <div className="flex flex-col items-start gap-1">
                          <InvoiceStatus status="pending" />
                          <span>{customer.total_pending}</span>
                        </div>
                      </div>
                      <div className="py-1 text-emerald-800 dark:text-zinc-200">
                        <div className="flex flex-col items-start gap-1">
                          <InvoiceStatus status="paid" />
                          <span>{customer.total_paid}</span>
                        </div>
                      </div>
                      <div
                        className="flex justify-end gap-3 py-1"
                        onClickCapture={stopRowNavigation}
                        onKeyDownCapture={stopRowNavigation}
                      >
                        <UpdateCustomer id={customer.id} returnTo={returnToPath} />
                        <DeleteCustomer id={customer.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {customers.length === 0 && (
              <div className="p-6 text-sm text-slate-600 dark:text-zinc-300">No customers yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
