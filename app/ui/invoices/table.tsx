// import Image from 'next/image';
import Link from 'next/link';
import { UpdateInvoice, DeleteInvoice } from '@/app/ui/invoices/buttons';
import PayInvoiceButton from '@/app/ui/invoices/pay-button';
import InvoiceStatus from '@/app/ui/invoices/status';
import { formatDateToLocal, formatCurrency } from '@/app/lib/utils';
import type { InvoicesTable as InvoicesTableType } from '@/app/lib/definitions';

export default function InvoicesTable({
  invoices,
}: {
  invoices: InvoicesTableType[];
}) {
  return (
    <div className="mt-6 flow-root">
      <div className="inline-block min-w-full align-middle">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-2 md:pt-0">
          <div className="md:hidden">
            {invoices?.map((invoice) => (
              <div
                key={invoice.id}
                className="mb-2 w-full rounded-md border border-slate-800 bg-slate-950/60 p-4"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <div className="mb-2 flex items-center">
                      <div className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/20 text-xs font-semibold text-sky-300">
                        {invoice.name.charAt(0).toUpperCase()}
                      </div>
                      <p>{invoice.name}</p>
                    </div>
                    <p className="text-sm text-slate-400">{invoice.email}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <InvoiceStatus status={invoice.status} />
                    {invoice.status === 'pending' && invoice.days_overdue > 0 && (
                      <span className="mt-1 text-xs text-amber-300">
                        Overdue by {invoice.days_overdue} day
                        {invoice.days_overdue === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex w-full items-center justify-between pt-4">
                  <div>
                    <p className="text-xl font-medium">
                      {formatCurrency(invoice.amount)}
                    </p>
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="text-sm text-sky-300 hover:text-sky-200"
                    >
                      {invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`}
                    </Link>
                    <p>{formatDateToLocal(invoice.date)}</p>
                    <p className="text-sm text-slate-400">
                      Due {invoice.due_date ? formatDateToLocal(invoice.due_date) : '—'}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    {invoice.status !== 'paid' && (
                      <PayInvoiceButton
                        invoiceId={invoice.id}
                        className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    )}
                    <UpdateInvoice id={invoice.id} />
                    <DeleteInvoice id={invoice.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <table className="hidden min-w-full text-slate-100 md:table">
            <thead className="rounded-lg bg-slate-950/40 text-left text-sm font-semibold text-slate-300">
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
                <th scope="col" className="relative py-3 pl-6 pr-3">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-slate-950/40">
              {invoices?.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="w-full border-b border-slate-800 py-3 text-sm last-of-type:border-none [&:first-child>td:first-child]:rounded-tl-lg [&:first-child>td:last-child]:rounded-tr-lg [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg"
                >
                  <td className="whitespace-nowrap bg-slate-900/60 py-3 pl-6 pr-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/20 text-xs font-semibold text-sky-300">
                        {invoice.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p>{invoice.name}</p>
                        <Link
                          href={`/dashboard/invoices/${invoice.id}`}
                          className="text-xs text-sky-300 hover:text-sky-200"
                        >
                          {invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`}
                        </Link>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap bg-slate-900/60 px-3 py-3 text-slate-200">
                    {invoice.email}
                  </td>
                  <td className="whitespace-nowrap bg-slate-900/60 px-3 py-3 text-sky-200">
                    {formatCurrency(invoice.amount)}
                  </td>
                  <td className="whitespace-nowrap bg-slate-900/60 px-3 py-3 text-slate-300">
                    {formatDateToLocal(invoice.date)}
                  </td>
                  <td className="whitespace-nowrap bg-slate-900/60 px-3 py-3 text-slate-300">
                    {invoice.due_date ? formatDateToLocal(invoice.due_date) : '—'}
                  </td>
                  <td className="whitespace-nowrap bg-slate-900/60 px-3 py-3">
                    <div className="flex flex-col">
                      <InvoiceStatus status={invoice.status} />
                      {invoice.status === 'pending' && invoice.days_overdue > 0 && (
                        <span className="mt-1 text-xs text-amber-300">
                          Overdue by {invoice.days_overdue} day
                          {invoice.days_overdue === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap bg-slate-900/60 py-3 pl-6 pr-3">
                    <div className="flex justify-end gap-3">
                      {invoice.status !== 'paid' && (
                        <PayInvoiceButton
                          invoiceId={invoice.id}
                          className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="p-6 text-sm text-slate-300">No invoices yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
