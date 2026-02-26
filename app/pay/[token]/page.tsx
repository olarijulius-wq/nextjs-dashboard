import postgres from 'postgres';
import PublicPayButton from '@/app/ui/invoices/public-pay-button';
import InvoiceStatus from '@/app/ui/invoices/status';
import { formatCurrency } from '@/app/lib/utils';
import { verifyPayToken } from '@/app/lib/pay-link';
import { canPayInvoiceStatus } from '@/app/lib/invoice-status';
import {
  getCompanyProfileForInvoiceWorkspace,
  MissingInvoiceWorkspaceError,
} from '@/app/lib/public-branding';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoice Payment',
  robots: {
    index: false,
    follow: false,
  },
};

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatDateTime(value: Date | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ paid?: string; canceled?: string }>;
};

type PageState =
  | {
      kind: 'invalid';
      title: string;
      description: string;
      contactEmail: string | null;
    }
  | {
      kind: 'ready' | 'paid';
      invoice: {
        id: string;
        amount: number;
        processing_uplift_amount: number | null;
        payable_amount: number | null;
        status: string;
        paid_at: Date | null;
        date: string;
        due_date: string | null;
        currency: string;
        invoice_number: string | null;
        description: string | null;
        customer_name: string;
        owner_connect_account_id: string | null;
        workspace_id: string | null;
        user_email: string | null;
        merchant_name: string | null;
        billing_email: string | null;
      };
      isPaidBanner: boolean;
      isCanceledBanner: boolean;
    };

async function fetchPageState(token: string, searchParams?: { paid?: string; canceled?: string }): Promise<PageState> {
  const verification = verifyPayToken(token);
  if (!verification.ok) {
    return {
      kind: 'invalid',
      title: verification.reason === 'expired' ? 'Payment link expired' : 'Payment link invalid',
      description:
        verification.reason === 'expired'
          ? 'This payment link has expired. Please request a new link from the sender.'
          : 'This payment link is invalid. Please check the URL or ask the sender for a new link.',
      contactEmail: null,
    };
  }

  const [invoice] = await sql<{
    id: string;
    amount: number;
    processing_uplift_amount: number | null;
    payable_amount: number | null;
    status: string;
    paid_at: Date | null;
    date: string;
    due_date: string | null;
    currency: string;
    invoice_number: string | null;
    description: string | null;
    customer_name: string;
    owner_connect_account_id: string | null;
    workspace_id: string | null;
    user_email: string | null;
  }[]>`
    SELECT
      invoices.id,
      invoices.amount,
      invoices.processing_uplift_amount,
      invoices.payable_amount,
      invoices.status,
      invoices.paid_at,
      invoices.date,
      invoices.due_date,
      invoices.currency,
      invoices.invoice_number,
      invoices.description,
      customers.name AS customer_name,
      users.stripe_connect_account_id AS owner_connect_account_id,
      invoices.workspace_id,
      invoices.user_email
    FROM invoices
    JOIN customers ON customers.id = invoices.customer_id
    LEFT JOIN users ON lower(users.email) = lower(invoices.user_email)
    WHERE invoices.id = ${verification.payload.invoiceId}
    LIMIT 1
  `;

  if (!invoice) {
    return {
      kind: 'invalid',
      title: 'Invoice unavailable',
      description: 'This invoice no longer exists. Please contact the sender for help.',
      contactEmail: null,
    };
  }

  let branding: Awaited<ReturnType<typeof getCompanyProfileForInvoiceWorkspace>>;
  try {
    branding = await getCompanyProfileForInvoiceWorkspace({
      invoiceId: invoice.id,
      workspaceId: invoice.workspace_id,
      userEmail: invoice.user_email,
    });
  } catch (error) {
    if (error instanceof MissingInvoiceWorkspaceError) {
      return {
        kind: 'invalid',
        title: 'Invoice unavailable',
        description: 'This invoice no longer exists. Please contact the sender for help.',
        contactEmail: null,
      };
    }
    throw error;
  }

  if (invoice.status === 'paid') {
    return {
      kind: 'paid',
      invoice: {
        ...invoice,
        merchant_name: branding.companyName,
        billing_email: branding.billingEmail,
      },
      isPaidBanner: true,
      isCanceledBanner: false,
    };
  }

  return {
    kind: 'ready',
    invoice: {
      ...invoice,
      merchant_name: branding.companyName,
      billing_email: branding.billingEmail,
    },
    isPaidBanner: searchParams?.paid === '1',
    isCanceledBanner: searchParams?.canceled === '1',
  };
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const state = await fetchPageState(params.token, searchParams);

  if (state.kind === 'invalid') {
    return (
      <main className="min-h-screen bg-white px-6 py-12 text-neutral-900 dark:bg-black dark:text-zinc-100">
        <div className="mx-auto w-full max-w-xl">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-zinc-100">
              {state.title}
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-zinc-300">{state.description}</p>
            {state.contactEmail ? (
              <a
                href={`mailto:${state.contactEmail}`}
                className="mt-4 inline-flex text-sm font-medium text-neutral-900 underline underline-offset-2 dark:text-zinc-100"
              >
                Contact billing
              </a>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  const { invoice } = state;
  const displayNumber = invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`;
  const payableAmount =
    typeof invoice.payable_amount === 'number' ? invoice.payable_amount : invoice.amount;
  const amountLabel = formatCurrency(payableAmount, invoice.currency);
  const hasConnect = !!invoice.owner_connect_account_id?.trim();
  const canPay = canPayInvoiceStatus(invoice.status) && hasConnect;
  const isPaid = state.kind === 'paid';
  const merchantName = invoice.merchant_name?.trim() || 'Merchant';
  const contactEmail = invoice.billing_email?.trim() || null;

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-neutral-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto w-full max-w-xl space-y-4">
        {state.isPaidBanner ? (
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-emerald-700 dark:border-zinc-800 dark:bg-black dark:text-emerald-300">
            Payment successful. Thank you.
          </div>
        ) : null}
        {state.isCanceledBanner ? (
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 dark:border-zinc-800 dark:bg-black dark:text-zinc-200">
            Payment was canceled.
          </div>
        ) : null}

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-zinc-400">Invoice</p>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-zinc-100">{displayNumber}</h1>
            <p className="text-sm text-neutral-600 dark:text-zinc-400">
              {merchantName} · {invoice.customer_name}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
            <p className="text-xs text-neutral-500 dark:text-zinc-400">Amount due</p>
            <p className="mt-1 text-3xl font-semibold text-neutral-900 dark:text-zinc-100">{amountLabel}</p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-zinc-300">Due {formatDate(invoice.due_date)}</p>
          </div>

          <div className="mt-4">
            {isPaid ? (
              <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/35 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Paid</p>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  Paid at {formatDateTime(invoice.paid_at)}
                </p>
                <InvoiceStatus status={invoice.status} />
              </div>
            ) : canPay ? (
              <PublicPayButton token={params.token} className="w-full justify-center py-2.5 text-sm" />
            ) : (
              <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm text-neutral-700 dark:text-zinc-300">
                  This invoice cannot be paid online right now.
                </p>
                <InvoiceStatus status={invoice.status} />
              </div>
            )}
            <p className="mt-2 text-xs text-neutral-500 dark:text-zinc-400">
              Payment methods are shown in Stripe Checkout based on supported options.
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-zinc-400">Secure payment via Stripe.</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <a
              href={`/api/public/invoices/${params.token}/pdf`}
              className="text-neutral-700 underline underline-offset-2 dark:text-zinc-300"
            >
              Download PDF
            </a>
            {contactEmail ? (
              <a href={`mailto:${contactEmail}`} className="text-neutral-700 underline underline-offset-2 dark:text-zinc-300">
                Contact
              </a>
            ) : null}
            {invoice.description ? (
              <p className="text-neutral-600 dark:text-zinc-400">{invoice.description}</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
