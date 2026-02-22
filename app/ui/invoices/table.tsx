'use client';

// import Image from 'next/image';
import Link from 'next/link';
import { UpdateInvoice, DeleteInvoice } from '@/app/ui/invoices/buttons';
import PayInvoiceButton from '@/app/ui/invoices/pay-button';
import InvoiceStatus from '@/app/ui/invoices/status';
import { formatDateToLocal, formatCurrencySuffix } from '@/app/lib/utils';
import type { InvoicesTable as InvoicesTableType } from '@/app/lib/definitions';
import { DARK_PILL, DARK_SURFACE_SUBTLE } from '@/app/ui/theme/tokens';
import { canPayInvoiceStatus } from '@/app/lib/invoice-status';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import SendInvoiceButton from '@/app/ui/invoices/send-invoice-button';

export default function InvoicesTable({
  invoices,
  hasStripeConnect,
  highlightedInvoiceId,
  returnToPath,
}: {
  invoices: InvoicesTableType[];
  hasStripeConnect: boolean;
  highlightedInvoiceId?: string;
  returnToPath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sendStateByInvoiceId, setSendStateByInvoiceId] = useState<
    Record<string, { status: string | null; sentAt: string | null }>
  >({});
  const [lastSentInvoiceId, setLastSentInvoiceId] = useState<string | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const lastSentInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === lastSentInvoiceId) ?? null,
    [invoices, lastSentInvoiceId],
  );

  useEffect(() => {
    if (!highlightedInvoiceId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('highlight') === highlightedInvoiceId) {
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
  }, [highlightedInvoiceId, pathname, router]);

  useEffect(() => {
    if (!lastSentInvoiceId) return;
    const timeout = window.setTimeout(() => setLastSentInvoiceId(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [lastSentInvoiceId]);

  function handleInvoiceSent(input: { invoiceId: string; sentAt: string }) {
    setSendStateByInvoiceId((current) => ({
      ...current,
      [input.invoiceId]: { status: 'sent', sentAt: input.sentAt },
    }));
    setLastSentInvoiceId(input.invoiceId);
  }

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

  function navigateToInvoice(invoiceId: string) {
    router.push(`/dashboard/invoices/${invoiceId}?returnTo=${encodeURIComponent(returnToPath)}`);
  }

  function onRowPointerDown(event: PointerEvent<HTMLElement>) {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }

  function onRowClick(event: MouseEvent<HTMLElement>, invoiceId: string) {
    if (isFromInteractiveElement(event.target) || hasSelectionText()) return;

    const start = pointerDownRef.current;
    if (start) {
      const movedX = Math.abs(event.clientX - start.x);
      const movedY = Math.abs(event.clientY - start.y);
      if (movedX > 6 || movedY > 6) return;
    }

    navigateToInvoice(invoiceId);
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLElement>, invoiceId: string) {
    if (isFromInteractiveElement(event.target)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    navigateToInvoice(invoiceId);
  }

  return (
    <div className="mt-6 min-w-0 flow-root">
      {lastSentInvoice ? (
        <div className="mb-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200">
          Sent invoice {lastSentInvoice.invoice_number ?? `#${lastSentInvoice.id.slice(0, 8)}`}.
        </div>
      ) : null}
      {/* Keep horizontal scrolling scoped to this container, never the dashboard/page root. */}
      <div className="min-w-0 overflow-x-auto overflow-y-visible">
        <div className="inline-block min-w-full align-middle">
          <div className={`overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_12px_24px_rgba(15,23,42,0.06)] md:pt-0 ${DARK_SURFACE_SUBTLE} dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]`}>
          <div className="md:hidden">
            {invoices?.map((invoice) => {
              const isHighlighted = highlightedInvoiceId === invoice.id;
              return (
                <div
                  key={invoice.id}
                  role="link"
                  tabIndex={0}
                  onPointerDown={onRowPointerDown}
                  onClick={(event) => onRowClick(event, invoice.id)}
                  onKeyDown={(event) => onRowKeyDown(event, invoice.id)}
                  className={`mb-2 w-full cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 transition duration-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:hover:bg-zinc-950 dark:focus-visible:ring-zinc-700 ${DARK_SURFACE_SUBTLE} ${
                    isHighlighted
                      ? 'ring-2 ring-emerald-300/80 bg-emerald-50/60 dark:ring-emerald-500/60 dark:bg-emerald-500/10'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-zinc-900">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/invoices/${invoice.id}?returnTo=${encodeURIComponent(returnToPath)}`}
                        onClick={stopRowNavigation}
                        className="mb-2 block truncate text-xs text-slate-600 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                      >
                        {invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`}
                      </Link>
                      <div className="mb-2 flex items-center">
                        <div className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white dark:bg-black dark:text-zinc-100 dark:border dark:border-zinc-800">
                          {invoice.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                          {invoice.name}
                        </p>
                      </div>
                      <p className="truncate text-xs text-slate-600 dark:text-zinc-400">
                        {invoice.email}
                      </p>
                    </div>
                    <div className="shrink-0 pl-2">
                      <div
                        className="flex flex-col items-end text-right leading-tight"
                        onClickCapture={stopRowNavigation}
                        onKeyDownCapture={stopRowNavigation}
                      >
                        <InvoiceStatus status={invoice.status} />
                        {invoice.status === 'pending' && invoice.days_overdue > 0 && (
                          <span className={`mt-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 ${DARK_PILL}`}>
                            Overdue by {invoice.days_overdue} day
                            {invoice.days_overdue === 1 ? '' : 's'}
                          </span>
                        )}
                        <div className="flex items-center justify-end gap-2">
                          <SendInvoiceButton
                            invoiceId={invoice.id}
                            compact
                            returnTo={returnToPath}
                            onSent={handleInvoiceSent}
                            initialStatus={
                              sendStateByInvoiceId[invoice.id]?.status ?? invoice.last_email_status
                            }
                            initialSentAt={
                              sendStateByInvoiceId[invoice.id]?.sentAt ?? invoice.last_email_sent_at
                            }
                            initialError={invoice.last_email_error}
                          />
                          {canPayInvoiceStatus(invoice.status) &&
                            (hasStripeConnect ? (
                              <PayInvoiceButton
                                invoiceId={invoice.id}
                                className="rounded-md px-2 py-1 text-xs whitespace-nowrap"
                              />
                            ) : (
                              <Link
                                href="/dashboard/settings/payouts"
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                              >
                                Connect Stripe
                              </Link>
                            ))}
                        </div>
                        {invoice.last_email_status ? (
                          <div className="mt-1 max-w-[220px]">
                            <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-slate-500 dark:text-zinc-400">
                              Email: {invoice.last_email_status}
                            </p>
                            {invoice.last_email_sent_at ? (
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                                {formatDateToLocal(invoice.last_email_sent_at)}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3 pt-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                        {formatCurrencySuffix(invoice.amount)}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-zinc-400">
                        {formatDateToLocal(invoice.date)}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-zinc-400">
                        Due{' '}
                        {invoice.due_date ? formatDateToLocal(invoice.due_date) : '—'}
                      </p>
                    </div>
                    <div
                      className="flex shrink-0 flex-col items-end gap-2 pl-2"
                      onClickCapture={stopRowNavigation}
                      onKeyDownCapture={stopRowNavigation}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <UpdateInvoice id={invoice.id} returnTo={returnToPath} />
                        <DeleteInvoice id={invoice.id} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
            <table className="hidden w-full min-w-[900px] text-slate-900 dark:text-zinc-100 md:table">
            <thead className="sticky top-0 z-10 rounded-lg border-b border-neutral-200 bg-white text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-100">
              <tr>
                <th scope="col" className="px-4 py-5 font-medium sm:pl-6">
                  Customer
                </th>
                <th scope="col" className="px-3 py-5 font-medium">
                  Email
                </th>
                <th scope="col" className="px-3 py-5 font-medium">
                  Amount
                </th>
                <th scope="col" className="px-3 py-5 font-medium">
                  Date
                </th>
                <th scope="col" className="px-3 py-5 font-medium">
                  Due date
                </th>
                <th scope="col" className="px-3 py-5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-5 font-medium text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm text-slate-700 dark:divide-zinc-900 dark:text-zinc-200">
              {invoices?.map((invoice) => {
                const isHighlighted = highlightedInvoiceId === invoice.id;

                return (
                  <tr
                    key={invoice.id}
                    role="link"
                    tabIndex={0}
                    onPointerDown={onRowPointerDown}
                    onClick={(event) => onRowClick(event, invoice.id)}
                    onKeyDown={(event) => onRowKeyDown(event, invoice.id)}
                    className={`w-full cursor-pointer transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300 dark:hover:bg-zinc-950 dark:focus-visible:ring-zinc-700 last-of-type:border-none [&:first-child>td:first-child]:rounded-tl-xl [&:first-child>td:last-child]:rounded-tr-xl [&:last-child>td:first-child]:rounded-bl-xl [&:last-child>td:last-child]:rounded-br-xl ${
                      isHighlighted
                        ? 'bg-emerald-50/70 ring-2 ring-inset ring-emerald-300/80 dark:bg-emerald-500/10 dark:ring-emerald-500/60'
                        : ''
                    }`}
                  >
                    <td className="whitespace-nowrap py-3 pl-6 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white dark:bg-black dark:text-zinc-100 dark:border dark:border-zinc-800">
                          {invoice.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p>{invoice.name}</p>
                          <Link
                            href={`/dashboard/invoices/${invoice.id}?returnTo=${encodeURIComponent(returnToPath)}`}
                            onClick={stopRowNavigation}
                            className="text-xs text-slate-600 hover:text-slate-700 dark:text-zinc-200 dark:hover:text-zinc-300"
                          >
                            {invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`}
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700 dark:text-zinc-300">
                      {invoice.email}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700 dark:text-zinc-300">
                      {formatCurrencySuffix(invoice.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-zinc-400">
                      {formatDateToLocal(invoice.date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600 dark:text-zinc-400">
                      {invoice.due_date ? formatDateToLocal(invoice.due_date) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="flex flex-col">
                        <InvoiceStatus status={invoice.status} />
                        {invoice.status === 'pending' && invoice.days_overdue > 0 && (
                          <span className={`mt-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 ${DARK_PILL}`}>
                            Overdue by {invoice.days_overdue} day
                            {invoice.days_overdue === 1 ? '' : 's'}
                          </span>
                        )}
                        {invoice.last_email_status ? (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                            Email: {invoice.last_email_status}
                            {invoice.last_email_sent_at ? ` · ${formatDateToLocal(invoice.last_email_sent_at)}` : ''}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-center">
                      <div
                        className="flex justify-center gap-3"
                        onClickCapture={stopRowNavigation}
                        onKeyDownCapture={stopRowNavigation}
                      >
                        <SendInvoiceButton
                          invoiceId={invoice.id}
                          compact
                          returnTo={returnToPath}
                          onSent={handleInvoiceSent}
                          initialStatus={
                            sendStateByInvoiceId[invoice.id]?.status ?? invoice.last_email_status
                          }
                          initialSentAt={
                            sendStateByInvoiceId[invoice.id]?.sentAt ?? invoice.last_email_sent_at
                          }
                          initialError={invoice.last_email_error}
                        />
                        {canPayInvoiceStatus(invoice.status) &&
                          (hasStripeConnect ? (
                            <PayInvoiceButton
                              invoiceId={invoice.id}
                              className="rounded-md px-2 py-1 text-xs"
                            />
                          ) : (
                            <Link
                              href="/dashboard/settings/payouts"
                              className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              Connect Stripe
                            </Link>
                          ))}
                        <UpdateInvoice id={invoice.id} returnTo={returnToPath} />
                        <DeleteInvoice id={invoice.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

            {invoices.length === 0 && (
              <div className="p-6 text-sm text-slate-600 dark:text-zinc-300">No invoices yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
