import { notFound } from 'next/navigation';
import postgres from 'postgres';
import PublicPayButton from '@/app/ui/invoices/public-pay-button';
import { verifyPayToken } from '@/app/lib/pay-link';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

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
  const payload = verifyPayToken(params.token);

  if (!payload) {
    notFound();
  }

  const [invoice] = await sql<{
    id: string;
    amount: number;
    status: 'pending' | 'paid';
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
    WHERE invoices.id = ${payload.invoiceId}
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

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {isPaid && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Payment successful. Thank you!
          </div>
        )}
        {!isPaid && isCanceled && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
            Payment was canceled.
          </div>
        )}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Invoice
              </p>
              <h1 className="text-2xl font-semibold text-slate-100">
                {displayNumber}
              </h1>
              <p className="text-sm text-slate-400">
                {invoice.customer_name} • {invoice.customer_email}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">Amount due</p>
              <p className="text-3xl font-semibold text-slate-100">
                {amountLabel}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-slate-400">Issued</p>
              <p className="text-sm text-slate-200">
                {formatDate(invoice.date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Due date</p>
              <p className="text-sm text-slate-200">
                {formatDate(invoice.due_date)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Status</p>
              <p className="text-sm font-semibold text-slate-100">
                {invoice.status === 'paid' ? 'Paid' : 'Pending'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Description</p>
              <p className="text-sm text-slate-200">
                {invoice.description ?? '—'}
              </p>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Notes
              </p>
              <p className="mt-2 text-sm text-slate-200">{invoice.notes}</p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Secure payment powered by Stripe.
            </p>
            {invoice.status === 'paid' ? (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                Paid
              </span>
            ) : (
              <PublicPayButton token={params.token} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
