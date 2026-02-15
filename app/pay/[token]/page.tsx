import { notFound } from 'next/navigation';
import postgres from 'postgres';
import PublicPayButton from '@/app/ui/invoices/public-pay-button';
import PublicRefundRequest from '@/app/ui/invoices/public-refund-request';
import InvoiceStatus from '@/app/ui/invoices/status';
import { formatCurrency } from '@/app/lib/utils';
import { verifyPayToken } from '@/app/lib/pay-link';
import { canPayInvoiceStatus } from '@/app/lib/invoice-status';
import { isRefundWindowOpen } from '@/app/lib/refund-requests';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ paid?: string; canceled?: string }>;
};

export default async function Page(props: PageProps) {
  const params = await props.params;
  const searchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const verification = verifyPayToken(params.token);

  if (!verification.ok) {
    notFound();
  }

  const [invoice] = await sql<{
    id: string;
    amount: number;
    status: string;
    paid_at: Date | null;
    date: string;
    due_date: string | null;
    currency: string;
    invoice_number: string | null;
    description: string | null;
    notes: string | null;
    customer_name: string;
    customer_email: string;
  }[]>`
    SELECT
      invoices.id,
      invoices.amount,
      invoices.status,
      invoices.paid_at,
      invoices.date,
      invoices.due_date,
      invoices.currency,
      invoices.invoice_number,
      invoices.description,
      invoices.notes,
      customers.name AS customer_name,
      customers.email AS customer_email
    FROM invoices
    JOIN customers ON customers.id = invoices.customer_id
    WHERE invoices.id = ${verification.payload.invoiceId}
    LIMIT 1
  `;

  if (!invoice) {
    notFound();
  }

  const displayNumber =
    invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`;
  const amountLabel = formatCurrency(invoice.amount, invoice.currency);
  const isPaid = searchParams?.paid === '1';
  const isCanceled = searchParams?.canceled === '1';
  let hasPendingRefundRequest = false;

  try {
    const [tableCheck] = await sql<{ refund_requests: string | null }[]>`
      select to_regclass('public.refund_requests') as refund_requests
    `;

    if (tableCheck?.refund_requests) {
      const [pending] = await sql<{ exists: boolean }[]>`
        select exists (
          select 1
          from public.refund_requests
          where invoice_id = ${invoice.id}
            and status = 'pending'
        )
      `;
      hasPendingRefundRequest = !!pending?.exists;
    }
  } catch {
    hasPendingRefundRequest = false;
  }

  const canRequestRefund = invoice.status === 'paid' && isRefundWindowOpen(invoice.paid_at);
  const isRefundWindowClosed = invoice.status === 'paid' && !canRequestRefund;
  const canPay = canPayInvoiceStatus(invoice.status);

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-neutral-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {isPaid && (
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-emerald-700 dark:border-zinc-800 dark:bg-black dark:text-emerald-300">
            Payment successful. Thank you!
          </div>
        )}
        {!isPaid && isCanceled && (
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 dark:border-zinc-800 dark:bg-black dark:text-zinc-200">
            Payment was canceled.
          </div>
        )}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-zinc-400">
                Invoice
              </p>
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-zinc-100">
                {displayNumber}
              </h1>
              <p className="text-sm text-neutral-600 dark:text-zinc-400">
                {invoice.customer_name} • {invoice.customer_email}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-neutral-500 dark:text-zinc-400">Amount due</p>
              <p className="text-3xl font-semibold text-neutral-900 dark:text-zinc-100">
                {amountLabel}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-black md:grid-cols-2">
            <div>
              <p className="text-xs text-neutral-500 dark:text-zinc-400">Issued</p>
              <p className="text-sm text-neutral-700 dark:text-zinc-200">
                {formatDate(invoice.date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-zinc-400">Due date</p>
              <p className="text-sm text-neutral-700 dark:text-zinc-200">
                {formatDate(invoice.due_date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-zinc-400">Status</p>
              <InvoiceStatus status={invoice.status} />
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-zinc-400">Description</p>
              <p className="text-sm text-neutral-700 dark:text-zinc-200">
                {invoice.description ?? '—'}
              </p>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
              <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-zinc-400">
                Notes
              </p>
              <p className="mt-2 text-sm text-neutral-700 dark:text-zinc-200">{invoice.notes}</p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 dark:text-zinc-400">
              Secure payment powered by Stripe.
            </p>
            {!canPay ? (
              <InvoiceStatus status={invoice.status} />
            ) : (
              <PublicPayButton token={params.token} />
            )}
          </div>

          {invoice.status === 'paid' && (
            <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-zinc-800">
              {isRefundWindowClosed ? (
                <p className="text-sm text-neutral-600 dark:text-zinc-300">
                  Refund window closed. Contact the seller.
                </p>
              ) : (
                <PublicRefundRequest
                  token={params.token}
                  hasPendingRequest={hasPendingRefundRequest}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
