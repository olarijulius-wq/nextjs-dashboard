import { Metadata } from 'next';
import Pagination from '@/app/ui/invoices/pagination';
import Table from '@/app/ui/invoices/table';
import { CreateInvoice } from '@/app/ui/invoices/buttons';
import {
  fetchFilteredInvoices,
  fetchInvoicesPages,
  fetchUserInvoiceUsageProgress,
  fetchInvoicePayActionContext,
  type InvoiceSortDir,
  type InvoiceSortKey,
  type InvoiceStatusFilter,
} from '@/app/lib/data';
import ExportInvoicesButton from './export-button';
import { PLAN_CONFIG } from '@/app/lib/config';
import { RevealOnMount } from '@/app/ui/motion/reveal';
import { toolbarButtonClasses } from '@/app/ui/button';
import MobileExpandableSearchToolbar from '@/app/ui/dashboard/mobile-expandable-search-toolbar';
import UpgradeNudge from '@/app/ui/upgrade-nudge';
import InvoicesListControls from '@/app/ui/invoices/list-controls';
import InvoicesUpdatedToast from '@/app/ui/invoices/updated-toast';
import DashboardPageTitle from '@/app/ui/dashboard/page-title';

export const metadata: Metadata = {
  title: 'Invoices',
};
 
export default async function Page(props: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
    status?: string;
    sort?: string;
    dir?: string;
    pageSize?: string;
    highlight?: string;
    updated?: string;
    updatedInvoice?: string;
    interval?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const currentPage = Number(searchParams?.page) > 0 ? Number(searchParams?.page) : 1;
  const statusFilter: InvoiceStatusFilter =
    searchParams?.status === 'overdue' ||
    searchParams?.status === 'unpaid' ||
    searchParams?.status === 'paid' ||
    searchParams?.status === 'refunded'
      ? searchParams.status
      : 'all';
  const sortKey: InvoiceSortKey =
    searchParams?.sort === 'due_date' ||
    searchParams?.sort === 'amount' ||
    searchParams?.sort === 'created_at' ||
    searchParams?.sort === 'customer' ||
    searchParams?.sort === 'status'
      ? searchParams.sort
      : 'created_at';
  const sortDir: InvoiceSortDir =
    searchParams?.dir === 'asc' || searchParams?.dir === 'desc'
      ? searchParams.dir
      : 'desc';
  const pageSize =
    searchParams?.pageSize === '10' ||
    searchParams?.pageSize === '25' ||
    searchParams?.pageSize === '50' ||
    searchParams?.pageSize === '100'
      ? Number(searchParams.pageSize)
      : 50;
  const highlight = searchParams?.highlight?.trim() || '';
  const isUpdated = searchParams?.updated === '1';
  const updatedInvoiceId =
    searchParams?.updatedInvoice?.trim() || highlight || '';
  const interval = searchParams?.interval;
  const returnToParams = new URLSearchParams();

  if (query) returnToParams.set('query', query);
  if (searchParams?.status) returnToParams.set('status', searchParams.status);
  if (searchParams?.sort) returnToParams.set('sort', searchParams.sort);
  if (searchParams?.dir) returnToParams.set('dir', searchParams.dir);
  if (searchParams?.page) returnToParams.set('page', searchParams.page);
  if (searchParams?.pageSize) returnToParams.set('pageSize', searchParams.pageSize);
  const returnToPath =
    returnToParams.toString().length > 0
      ? `/dashboard/invoices?${returnToParams.toString()}`
      : '/dashboard/invoices';

  const [invoices, totalPages, usage, payActionContext] = await Promise.all([
    fetchFilteredInvoices(query, currentPage, statusFilter, sortKey, sortDir, pageSize),
    fetchInvoicesPages(query, statusFilter, pageSize),
    fetchUserInvoiceUsageProgress(),
    fetchInvoicePayActionContext(),
  ]);

  const { planId, usedThisMonth, maxPerMonth, percentUsed } = usage;
  const isBlocked = maxPerMonth !== null && percentUsed >= 1;
  const canExportCsv = PLAN_CONFIG[planId].canExportCsv;

  return (
    <main className="min-w-0">
      <RevealOnMount>
        <DashboardPageTitle title="Invoices" className="mb-3" />

        <div className="mb-4">
          <UpgradeNudge
            planId={planId}
            usedThisMonth={usedThisMonth}
            cap={maxPerMonth}
            percentUsed={percentUsed}
            interval={interval}
          />
        </div>

        <MobileExpandableSearchToolbar
          searchPlaceholder="Search invoices..."
          actions={
            <>
              <ExportInvoicesButton canExportCsv={canExportCsv} />
              {!isBlocked && <CreateInvoice />}
              {isBlocked && (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className={`${toolbarButtonClasses} cursor-not-allowed opacity-60`}
                >
                  <span>Create Invoice</span>
                </button>
              )}
            </>
          }
        />
      </RevealOnMount>

      {maxPerMonth !== null && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {usedThisMonth} / {maxPerMonth} invoices used on {planId} plan.
        </p>
      )}

      <RevealOnMount delay={0.12}>
        <div className="min-w-0">
          <InvoicesUpdatedToast
            visible={isUpdated}
            invoiceId={updatedInvoiceId}
          />
          <InvoicesListControls
            statusFilter={statusFilter}
            sortKey={sortKey}
            sortDir={sortDir}
            pageSize={pageSize}
          />
          <Table
            invoices={invoices}
            userRole={payActionContext.userRole}
            workspaceBillingMissing={payActionContext.workspaceBillingMissing}
            hasConnectedPayoutAccount={payActionContext.hasConnectedPayoutAccount}
            highlightedInvoiceId={highlight}
            returnToPath={returnToPath}
          />
          <div className="mt-6 flex w-full justify-center">
            <Pagination totalPages={totalPages} />
          </div>
        </div>
      </RevealOnMount>
    </main>
  );
}
