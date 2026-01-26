import { ArrowPathIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { lusitana } from '@/app/ui/fonts';
import { fetchLatestInvoices } from '@/app/lib/data';
import InvoiceStatus from '@/app/ui/invoices/status';
import Link from 'next/link';
import { formatDateToLocal } from '@/app/lib/utils';

export default async function LatestInvoices() {
  const latestInvoices = await fetchLatestInvoices();
  const isEmpty = !latestInvoices || latestInvoices.length === 0;

  return (
    <div className="flex w-full flex-col md:col-span-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className={`${lusitana.className} text-xl md:text-2xl`}>
          Latest Invoices
        </h2>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center rounded-md bg-sky-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-900/30 transition hover:bg-sky-400"
        >
          View all
        </Link>
      </div>

      <div className="flex grow flex-col justify-between rounded-md border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        {isEmpty ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6">
            <p className="text-sm text-slate-200">
              No invoices yet. Create your first invoice to see activity here.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/dashboard/customers"
                className="inline-flex items-center rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-400"
              >
                Add customer
              </Link>
              <Link
                href="/dashboard/invoices/create"
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
                Create invoice
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
            <div className="space-y-3 md:hidden">
              {latestInvoices.map((invoice) => {
                const invoiceLabel = invoice.invoice_number
                  ? `#${invoice.invoice_number}`
                  : `#${invoice.id.slice(0, 6).toUpperCase()}`;

                return (
                  <div
                    key={invoice.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-300">
                          {invoiceLabel}
                        </p>
                        <p className="text-sm font-semibold text-slate-100">
                          {invoice.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {invoice.email}
                        </p>
                      </div>
                      <InvoiceStatus status={invoice.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                      <span className={`${lusitana.className} text-sm text-sky-200`}>
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
              <div className="grid grid-cols-[120px_minmax(0,1fr)_120px_110px] gap-4 border-b border-slate-800 px-2 py-2 text-xs uppercase tracking-[0.12em] text-slate-500">
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
                      'grid grid-cols-[120px_minmax(0,1fr)_120px_110px] items-center gap-4 px-2 py-3 text-slate-200',
                      { 'border-t border-slate-800': i !== 0 },
                    )}
                  >
                    <div className="text-xs font-semibold text-slate-300 sm:text-sm">
                      {invoiceLabel}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {invoice.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {invoice.email}
                      </p>
                    </div>
                    <div
                      className={`${lusitana.className} text-sm font-semibold text-sky-200 sm:text-right`}
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
            <ArrowPathIcon className="h-5 w-5 text-slate-400" />
            <h3 className="ml-2 text-sm text-slate-400">Updated just now</h3>
          </div>
          <Link
            href="/dashboard/invoices"
            className="text-xs text-sky-300 hover:underline"
          >
            View all invoices
          </Link>
        </div>
      </div>
    </div>
  );
}
