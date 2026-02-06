import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import InvoiceStatus from '@/app/ui/invoices/status';
import { formatCurrency, formatDateToLocal } from '@/app/lib/utils';
import { fetchCustomerById, fetchInvoicesByCustomerId } from '@/app/lib/data';

export const metadata: Metadata = {
  title: 'Customer',
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const [customer, invoices] = await Promise.all([
    fetchCustomerById(id),
    fetchInvoicesByCustomerId(id),
  ]);

  if (!customer) {
    notFound();
  }

  const totals = invoices.reduce(
    (acc, invoice) => {
      acc.count += 1;
      if (invoice.status === 'paid') {
        acc.paid += invoice.amount;
      } else {
        acc.pending += invoice.amount;
      }
      return acc;
    },
    { count: 0, paid: 0, pending: 0, overdue: 0 },
  );

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">
            {customer.name}
          </h1>
          <p className="text-sm text-slate-400">{customer.email}</p>
        </div>
        <Link
          href="/dashboard/customers"
          className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01]"
        >
          Back
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Total invoices
            </p>
            <p className="text-lg font-semibold text-slate-100">
              {totals.count}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Total paid
            </p>
            <p className="text-lg font-semibold text-emerald-200">
              {formatCurrency(totals.paid)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Total pending
            </p>
            <p className="text-lg font-semibold text-amber-200">
              {formatCurrency(totals.pending)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Total overdue
            </p>
            <p className="text-lg font-semibold text-slate-200">
              {formatCurrency(totals.overdue)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-2 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:pt-0">
        {invoices.length === 0 ? (
          <div className="p-6 text-sm text-slate-300">
            No invoices for this customer yet.{' '}
            <Link
              href={`/dashboard/invoices/create?customerId=${customer.id}`}
              className="text-sky-300 hover:text-sky-200"
            >
              Create invoice for this customer
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-[600px] text-slate-100">
              <thead className="rounded-lg bg-slate-950/40 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-5 font-medium sm:pl-6">
                    Invoice
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm text-slate-200">
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="w-full transition hover:bg-slate-900/60 last-of-type:border-none [&:first-child>td:first-child]:rounded-tl-xl [&:first-child>td:last-child]:rounded-tr-xl [&:last-child>td:first-child]:rounded-bl-xl [&:last-child>td:last-child]:rounded-br-xl"
                  >
                    <td className="whitespace-nowrap py-3 pl-6 pr-3">
                      <Link
                        href={`/dashboard/invoices/${invoice.id}`}
                        className="text-sky-300 hover:text-sky-200"
                      >
                        #{invoice.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                      {formatDateToLocal(invoice.date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <InvoiceStatus status={invoice.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sky-200">
                      {formatCurrency(invoice.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
