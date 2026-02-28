import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/20/solid';
import InvoiceStatus from '@/app/ui/invoices/status';
import { formatCurrency, formatDateToLocal } from '@/app/lib/utils';
import {
  fetchCustomerById,
  fetchCustomerInvoiceSummaryByCustomerId,
  fetchCustomerInvoicesPagesByCustomerId,
  fetchFilteredCustomerInvoicesByCustomerId,
  type CustomerInvoiceSortDir,
  type CustomerInvoiceSortKey,
  type InvoiceStatusFilter,
} from '@/app/lib/data';
import { primaryButtonClasses, toolbarButtonClasses } from '@/app/ui/button';
import Pagination from '@/app/ui/invoices/pagination';
import CustomerInvoicesControls from '@/app/ui/customers/customer-invoices-controls';
import { EmptyState, PageShell, SectionCard, TwoColumnDetail } from '@/app/ui/page-layout';

export const metadata: Metadata = {
  title: 'Customer',
};

function formatEmbeddedInvoiceDate(dateStr: string, includeYear = false) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(new Date(dateStr));
}

export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    returnTo?: string;
    ciQuery?: string;
    ciStatus?: string;
    ciSort?: string;
    ciDir?: string;
    ciPage?: string;
    ciPageSize?: string;
  }>;
}) {
  const params = await props.params;
  const searchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const id = params.id;
  const ciQuery = searchParams?.ciQuery?.trim() || '';
  const ciStatus: InvoiceStatusFilter =
    searchParams?.ciStatus === 'paid' ||
    searchParams?.ciStatus === 'unpaid' ||
    searchParams?.ciStatus === 'overdue'
      ? searchParams.ciStatus
      : 'all';
  const ciSort: CustomerInvoiceSortKey =
    searchParams?.ciSort === 'due_date' ||
    searchParams?.ciSort === 'amount' ||
    searchParams?.ciSort === 'created_at'
      ? searchParams.ciSort
      : 'due_date';
  const ciDir: CustomerInvoiceSortDir =
    searchParams?.ciDir === 'asc' || searchParams?.ciDir === 'desc'
      ? searchParams.ciDir
      : 'asc';
  const ciPage = Number(searchParams?.ciPage) > 0 ? Number(searchParams?.ciPage) : 1;
  const ciPageSize =
    searchParams?.ciPageSize === '10' ||
    searchParams?.ciPageSize === '25' ||
    searchParams?.ciPageSize === '50' ||
    searchParams?.ciPageSize === '100'
      ? Number(searchParams.ciPageSize)
      : 25;
  const returnTo =
    typeof searchParams?.returnTo === 'string' &&
    searchParams.returnTo.startsWith('/dashboard/customers')
      ? searchParams.returnTo
      : '/dashboard/customers';
  const customerReturnToParams = new URLSearchParams();
  customerReturnToParams.set('returnTo', returnTo);
  if (ciQuery) customerReturnToParams.set('ciQuery', ciQuery);
  if (searchParams?.ciStatus) customerReturnToParams.set('ciStatus', searchParams.ciStatus);
  if (searchParams?.ciSort) customerReturnToParams.set('ciSort', searchParams.ciSort);
  if (searchParams?.ciDir) customerReturnToParams.set('ciDir', searchParams.ciDir);
  if (searchParams?.ciPage) customerReturnToParams.set('ciPage', searchParams.ciPage);
  if (searchParams?.ciPageSize) customerReturnToParams.set('ciPageSize', searchParams.ciPageSize);
  const customerReturnToPath = `/dashboard/customers/${id}?${customerReturnToParams.toString()}`;

  const [customer, summary, invoices, invoicePages] = await Promise.all([
    fetchCustomerById(id),
    fetchCustomerInvoiceSummaryByCustomerId(id),
    fetchFilteredCustomerInvoicesByCustomerId(
      id,
      ciQuery,
      ciPage,
      ciStatus,
      ciSort,
      ciDir,
      ciPageSize,
    ),
    fetchCustomerInvoicesPagesByCustomerId(id, ciQuery, ciStatus, ciPageSize),
  ]);

  if (!customer) {
    notFound();
  }
  const viewAllParams = new URLSearchParams();
  viewAllParams.set('query', ciQuery || customer.email || customer.name);
  if (ciStatus !== 'all') {
    viewAllParams.set('status', ciStatus);
  }

  return (
    <PageShell
      title={customer.name}
      subtitle={customer.email}
      actions={
        <>
          <Link
            href={`/dashboard/customers/${customer.id}/edit?returnTo=${encodeURIComponent(customerReturnToPath)}`}
            className={`${toolbarButtonClasses} h-9 px-3`}
          >
            Edit
          </Link>
          <Link href={returnTo} className={`${toolbarButtonClasses} h-9 px-3`}>
            Back
          </Link>
        </>
      }
    >
      <TwoColumnDetail
        className="lg:grid-cols-[minmax(0,6fr)_minmax(0,2fr)]"
        primary={
          <>
            <SectionCard className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-zinc-400">
                    Total invoices
                  </p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                    {summary.totalCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-zinc-400">
                    Total paid
                  </p>
                  <p className="text-lg font-semibold text-emerald-900 dark:text-zinc-100">
                    {formatCurrency(summary.totalPaid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-zinc-400">
                    Total unpaid
                  </p>
                  <p className="text-lg font-semibold text-amber-900 dark:text-zinc-100">
                    {formatCurrency(summary.totalUnpaid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-zinc-400">
                    Total overdue
                  </p>
                  <p className="text-lg font-semibold text-rose-900 dark:text-zinc-100">
                    {formatCurrency(summary.totalOverdue)}
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard className="space-y-3 p-3 md:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 px-1">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                    Customer invoices
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-zinc-400">
                    Filter and open invoices without leaving this customer.
                  </p>
                </div>
                <Link
                  href={`/dashboard/invoices?${viewAllParams.toString()}`}
                  className={`${primaryButtonClasses} h-9 px-3 text-sm`}
                >
                  View all invoices
                </Link>
              </div>

              <CustomerInvoicesControls
                statusFilter={ciStatus}
                sortKey={ciSort}
                sortDir={ciDir}
                pageSize={ciPageSize}
              />

              {invoices.length === 0 ? (
                <EmptyState
                  title="No matching invoices"
                  description="Try a different search/filter or create a new invoice for this customer."
                  action={
                    <Link
                      href={`/dashboard/invoices/create?customerId=${customer.id}&returnTo=${encodeURIComponent(customerReturnToPath)}`}
                      className={`${primaryButtonClasses} px-3 py-2`}
                    >
                      Create invoice
                    </Link>
                  }
                />
              ) : (
                <>
                  <div className="space-y-2 md:hidden">
                    {invoices.map((invoice) => (
                      <article
                        key={invoice.id}
                        className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-900 dark:bg-black"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                              {invoice.invoice_number || `#${invoice.id.slice(0, 8)}`}
                            </p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400">
                              Due{' '}
                              {invoice.due_date
                                ? formatEmbeddedInvoiceDate(invoice.due_date, true)
                                : '—'}
                            </p>
                          </div>
                          <InvoiceStatus status={invoice.status} />
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <p className="whitespace-nowrap text-sm tabular-nums text-slate-700 dark:text-zinc-300">
                            {formatCurrency(invoice.amount)}
                          </p>
                          <Link
                            href={`/dashboard/invoices/${invoice.id}?returnTo=${encodeURIComponent(customerReturnToPath)}`}
                            className={`${toolbarButtonClasses} inline-flex h-8 items-center gap-2 px-2.5 text-sm`}
                            aria-label={`Open invoice ${invoice.invoice_number || `#${invoice.id.slice(0, 8)}`}`}
                            title={`Open invoice ${invoice.invoice_number || `#${invoice.id.slice(0, 8)}`}`}
                          >
                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            <span>Open</span>
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="hidden w-full overflow-hidden rounded-xl border border-neutral-200 bg-white md:block dark:border-neutral-900 dark:bg-black">
                    <table className="w-full table-fixed text-left">
                      <thead className="border-b border-neutral-200 bg-white text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-100">
                        <tr>
                          <th scope="col" className="px-4 py-4 font-medium">
                            Invoice
                          </th>
                          <th scope="col" className="hidden px-3 py-4 font-medium lg:table-cell lg:w-28">
                            Created
                          </th>
                          <th scope="col" className="px-3 py-4 font-medium w-24 md:w-28">
                            Due
                          </th>
                          <th scope="col" className="px-3 py-4 font-medium w-24">
                            Status
                          </th>
                          <th scope="col" className="px-3 py-4 font-medium text-right w-24 md:w-28">
                            Amount
                          </th>
                          <th scope="col" className="px-3 py-4 font-medium text-right w-24 md:w-28">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200 text-sm text-slate-700 dark:divide-zinc-900 dark:text-zinc-300">
                        {invoices.map((invoice) => (
                          <tr
                            key={invoice.id}
                            className="transition hover:bg-slate-50 dark:hover:bg-zinc-950"
                          >
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-zinc-100">
                              <span className="block max-w-[14rem] truncate">
                                {invoice.invoice_number || `#${invoice.id.slice(0, 8)}`}
                              </span>
                            </td>
                            <td
                              className="hidden whitespace-nowrap px-3 py-3 lg:table-cell"
                              title={formatDateToLocal(invoice.date)}
                            >
                              {formatEmbeddedInvoiceDate(invoice.date)}
                            </td>
                            <td
                              className="whitespace-nowrap px-3 py-3"
                              title={invoice.due_date ? formatDateToLocal(invoice.due_date) : '—'}
                            >
                              {invoice.due_date ? formatEmbeddedInvoiceDate(invoice.due_date) : '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <InvoiceStatus status={invoice.status} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                              {formatCurrency(invoice.amount)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right">
                              <Link
                                href={`/dashboard/invoices/${invoice.id}?returnTo=${encodeURIComponent(customerReturnToPath)}`}
                                className={`${toolbarButtonClasses} inline-flex h-8 shrink-0 items-center justify-center gap-2 px-2.5 text-sm`}
                                aria-label={`Open invoice ${invoice.invoice_number || `#${invoice.id.slice(0, 8)}`}`}
                                title={`Open invoice ${invoice.invoice_number || `#${invoice.id.slice(0, 8)}`}`}
                              >
                                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                <span>Open</span>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-center">
                    <Pagination totalPages={invoicePages} pageParam="ciPage" />
                  </div>
                </>
              )}
            </SectionCard>
          </>
        }
        secondary={
          <>
            <SectionCard className="space-y-2">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-400">
                Customer
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                {customer.name}
              </p>
              <p className="text-sm text-slate-600 dark:text-zinc-400">{customer.email}</p>
              <Link
                href={`/dashboard/customers/${customer.id}/edit?returnTo=${encodeURIComponent(customerReturnToPath)}`}
                className={`${toolbarButtonClasses} h-9 px-3 text-sm`}
              >
                Quick edit
              </Link>
            </SectionCard>

            <SectionCard className="space-y-2">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-400">
                Quick actions
              </p>
              <Link
                href={`/dashboard/invoices/create?customerId=${customer.id}&returnTo=${encodeURIComponent(customerReturnToPath)}`}
                className={`${primaryButtonClasses} w-full px-3 py-2 text-sm`}
              >
                Create invoice
              </Link>
              <Link href={returnTo} className={`${toolbarButtonClasses} w-full px-3 py-2 text-sm`}>
                Back to customers
              </Link>
            </SectionCard>
          </>
        }
      />
    </PageShell>
  );
}
