import { ArrowPathIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { lusitana } from '@/app/ui/fonts';
import { fetchLatestInvoices } from '@/app/lib/data';
import InvoiceStatus from '@/app/ui/invoices/status';
import Link from 'next/link';
import { formatDateToLocal } from '@/app/lib/utils';
import {
  primaryButtonClasses,
  secondaryButtonClasses,
} from '@/app/ui/button';

export default async function LatestInvoices() {
  const latestInvoices = await fetchLatestInvoices();
  const isEmpty = !latestInvoices || latestInvoices.length === 0;

  return (
    <div className="flex w-full flex-col md:col-span-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className={`${lusitana.className} text-xl text-slate-900 dark:text-slate-100 md:text-2xl`}>
          Latest Invoices
        </h2>
        <Link
          href="/dashboard/invoices"
          className={`${primaryButtonClasses} px-3 py-2 text-xs`}
        >
          View all
        </Link>
      </div>

      <div className="group relative flex min-h-[420px] grow flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition-colors transition-shadow hover:cursor-pointer hover:border-neutral-300 hover:bg-slate-50/50 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)] dark:hover:border-zinc-700 dark:hover:bg-neutral-950">
        <Link
          href="/dashboard/invoices"
          aria-label="Open invoices"
          className="absolute inset-0 z-10 rounded-2xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black"
        />
        <div className="relative z-20 flex grow flex-col justify-between">
          {isEmpty ? (
            <div className="rounded-xl border border-neutral-200 bg-slate-50 p-6 dark:border-zinc-800 dark:bg-black">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                No invoices yet. Create your first invoice to see activity here.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/customers"
                  className={`${secondaryButtonClasses} relative z-20 px-3 py-2`}
                >
                  Add customer
                </Link>
                <Link
                  href="/dashboard/invoices/create"
                  className={`${primaryButtonClasses} relative z-20 px-3 py-2`}
                >
                  Create invoice
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-slate-50 px-4 py-3 dark:border-zinc-800 dark:bg-black">
              <div className="space-y-3 md:hidden">
                {latestInvoices.map((invoice) => {
                  const invoiceLabel = invoice.invoice_number
                    ? `#${invoice.invoice_number}`
                    : `#${invoice.id.slice(0, 6).toUpperCase()}`;

                  return (
                    <div
                      key={invoice.id}
                      className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-zinc-800 dark:bg-black"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {invoiceLabel}
                          </p>
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {invoice.name}
                          </p>
                          <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                            {invoice.email}
                          </p>
                        </div>
                        <InvoiceStatus status={invoice.status} />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                        <span className={`${lusitana.className} text-sm text-slate-900 dark:text-slate-100`}>
                          {invoice.amount}
                        </span>
                        <span>
                          Due{' '}
                          {invoice.due_date ? formatDateToLocal(invoice.due_date) : '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block">
                <div className="grid grid-cols-[120px_minmax(0,1fr)_120px_110px] gap-4 border-b border-neutral-200 px-2 py-2 text-xs uppercase tracking-[0.12em] text-slate-500 dark:border-zinc-800">
                  <span>Invoice</span>
                  <span>Customer</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Status</span>
                </div>
                {latestInvoices.map((invoice, i) => {
                  const invoiceLabel = invoice.invoice_number
                    ? `#${invoice.invoice_number}`
                    : `#${invoice.id.slice(0, 6).toUpperCase()}`;

                  return (
                    <div
                      key={invoice.id}
                      className={clsx(
                        'grid grid-cols-[120px_minmax(0,1fr)_120px_110px] items-center gap-4 px-2 py-3 text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-neutral-900',
                        { 'border-t border-neutral-200 dark:border-zinc-800': i !== 0 },
                      )}
                    >
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 sm:text-sm">
                        {invoiceLabel}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {invoice.name}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-500">
                          {invoice.email}
                        </p>
                      </div>
                      <div
                        className={`${lusitana.className} text-sm font-semibold text-slate-700 dark:text-slate-300 sm:text-right`}
                      >
                        {invoice.amount}
                      </div>
                      <div className="flex justify-end">
                        <InvoiceStatus status={invoice.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 pt-6">
            <div className="flex items-center">
              <ArrowPathIcon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              <h3 className="ml-2 text-sm text-slate-500 dark:text-slate-400">Updated just now</h3>
            </div>
            <Link
              href="/dashboard/invoices"
              className="relative z-20 text-xs text-slate-700 hover:underline dark:text-slate-200"
            >
              View all invoices
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
