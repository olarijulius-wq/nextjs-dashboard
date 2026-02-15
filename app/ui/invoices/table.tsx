// import Image from 'next/image';
import Link from 'next/link';
import { UpdateInvoice, DeleteInvoice } from '@/app/ui/invoices/buttons';
import PayInvoiceButton from '@/app/ui/invoices/pay-button';
import InvoiceStatus from '@/app/ui/invoices/status';
import { formatDateToLocal, formatCurrencySuffix } from '@/app/lib/utils';
import type { InvoicesTable as InvoicesTableType } from '@/app/lib/definitions';
import { DARK_PILL, DARK_SURFACE_SUBTLE } from '@/app/ui/theme/tokens';
import { canPayInvoiceStatus } from '@/app/lib/invoice-status';

export default function InvoicesTable({
  invoices,
}: {
  invoices: InvoicesTableType[];
}) {
  return (
    <div className="mt-6 flow-root">
      <div className="inline-block min-w-full align-middle">
        <div className={`rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_12px_24px_rgba(15,23,42,0.06)] md:pt-0 ${DARK_SURFACE_SUBTLE} dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]`}>
          <div className="md:hidden">
            {invoices?.map((invoice) => (
              <div
                key={invoice.id}
                className={`mb-2 w-full rounded-xl border border-neutral-200 bg-white p-4 ${DARK_SURFACE_SUBTLE}`}
              >
                <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-zinc-900">
                  <div className="min-w-0">
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
                  <div className="flex flex-col items-end">
                    <InvoiceStatus status={invoice.status} />
                    {invoice.status === 'pending' && invoice.days_overdue > 0 && (
                      <span className={`mt-1 inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 ${DARK_PILL}`}>
                        Overdue by {invoice.days_overdue} day
                        {invoice.days_overdue === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex w-full items-center justify-between pt-4">
                  <div>
                    <p className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                      {formatCurrencySuffix(invoice.amount)}
                    </p>
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="truncate text-xs text-slate-600 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                    >
                      {invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`}
                    </Link>
                    <p className="text-xs text-slate-600 dark:text-zinc-400">
                      {formatDateToLocal(invoice.date)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400">
                      Due{' '}
                      {invoice.due_date ? formatDateToLocal(invoice.due_date) : '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 justify-end gap-2">
                    {canPayInvoiceStatus(invoice.status) && (
                      <PayInvoiceButton
                        invoiceId={invoice.id}
                        className="rounded-md px-2 py-1 text-xs"
                      />
                    )}
                    <UpdateInvoice id={invoice.id} />
                    <DeleteInvoice id={invoice.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <table className="hidden min-w-full text-slate-900 dark:text-zinc-100 md:table">
            <thead className="rounded-lg bg-black text-left text-xs font-semibold uppercase tracking-[0.12em] text-white dark:bg-black dark:text-zinc-100">
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
              {invoices?.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="w-full transition hover:bg-slate-50 dark:hover:bg-zinc-950 last-of-type:border-none [&:first-child>td:first-child]:rounded-tl-xl [&:first-child>td:last-child]:rounded-tr-xl [&:last-child>td:first-child]:rounded-bl-xl [&:last-child>td:last-child]:rounded-br-xl"
                >
                  <td className="whitespace-nowrap py-3 pl-6 pr-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white dark:bg-black dark:text-zinc-100 dark:border dark:border-zinc-800">
                        {invoice.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p>{invoice.name}</p>
                        <Link
                          href={`/dashboard/invoices/${invoice.id}`}
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
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-5 text-center">
                    <div className="flex justify-center gap-3">
                      {canPayInvoiceStatus(invoice.status) && (
                        <PayInvoiceButton
                          invoiceId={invoice.id}
                          className="rounded-md px-2 py-1 text-xs"
                        />
                      )}
                      <UpdateInvoice id={invoice.id} />
                      <DeleteInvoice id={invoice.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {invoices.length === 0 && (
            <div className="p-6 text-sm text-slate-600 dark:text-zinc-300">No invoices yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
