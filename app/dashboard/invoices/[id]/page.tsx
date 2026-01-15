import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import InvoiceStatus from '@/app/ui/invoices/status';
import DuplicateInvoiceButton from '@/app/ui/invoices/duplicate-button';
import PayInvoiceButton from '@/app/ui/invoices/pay-button';
import { formatCurrency, formatDateToLocal } from '@/app/lib/utils';
import { fetchInvoiceById } from '@/app/lib/data';
import { updateInvoiceStatus } from '@/app/lib/actions';

export const metadata: Metadata = {
  title: 'Invoice',
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const invoice = await fetchInvoiceById(id);

  if (!invoice) {
    notFound();
  }

  const shortId = invoice.id.slice(0, 8);
  const displayNumber = invoice.invoice_number ?? `#${shortId}`;
  const statusAction =
    invoice.status === 'paid' ? 'pending' : 'paid';
  const statusLabel =
    invoice.status === 'paid' ? 'Mark as pending' : 'Mark as paid';
  const updateStatus = updateInvoiceStatus.bind(
    null,
    invoice.id,
    statusAction,
  );

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">
            Invoice {displayNumber}
          </h1>
          <p className="text-sm text-slate-400">
            {invoice.customer_name} • {invoice.customer_email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/invoices/${invoice.id}/edit`}
            className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-800/80"
          >
            Edit
          </Link>
          <Link
            href="/dashboard/invoices"
            className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-800/80"
          >
            Back
          </Link>
        </div>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Amount</p>
            <p className="text-2xl font-semibold text-slate-100">
              {formatCurrency(invoice.amount)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Date</p>
            <p className="text-sm text-slate-200">
              {formatDateToLocal(invoice.date)}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Status</p>
            <InvoiceStatus status={invoice.status} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={`/api/invoices/${invoice.id}/pdf`}
            className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-800/80"
          >
            Download PDF
          </Link>
          <form action={updateStatus}>
            <button
              type="submit"
              className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:border-emerald-400/60 hover:bg-slate-800/80"
            >
              {statusLabel}
            </button>
          </form>
          {invoice.status !== 'paid' && (
            <PayInvoiceButton invoiceId={invoice.id} />
          )}
          <DuplicateInvoiceButton id={invoice.id} />
        </div>
      </div>
    </main>
  );
}
