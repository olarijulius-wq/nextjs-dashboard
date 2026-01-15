import { Metadata } from 'next';
import { lusitana } from '@/app/ui/fonts';
import Search from '@/app/ui/search';
import Pagination from '@/app/ui/invoices/pagination';
import Table from '@/app/ui/invoices/table';
import { CreateInvoice } from '@/app/ui/invoices/buttons';
import {
  fetchFilteredInvoices,
  fetchInvoicesPages,
  fetchUserPlanAndUsage,
} from '@/app/lib/data';
import ExportInvoicesButton from './export-button';

export const metadata: Metadata = {
  title: 'Invoices',
};
 
export default async function Page(props: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const currentPage = Number(searchParams?.page) || 1;

  const [invoices, totalPages, plan] = await Promise.all([
    fetchFilteredInvoices(query, currentPage),
    fetchInvoicesPages(query),
    fetchUserPlanAndUsage(),
  ]);

  const { plan: planId, invoiceCount, maxPerMonth } = plan;
  const hasUnlimited = !Number.isFinite(maxPerMonth);
  const canCreate = hasUnlimited || invoiceCount < maxPerMonth;

  return (
    <main>
      <div className="mb-3">
        <h1 className={`${lusitana.className} text-xl md:text-2xl`}>
          Invoices
        </h1>
      </div>

      <div className="mb-4 flex w-full items-center justify-between gap-3">
        <div className="flex-1">
          <Search placeholder="Search invoices..." />
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex items-center gap-3">
            <ExportInvoicesButton />
            {canCreate ? (
              <CreateInvoice />
            ) : (
              <a
                href="/dashboard/settings"
                className="flex h-10 items-center rounded-lg border border-amber-500 bg-amber-500/90 px-4 text-sm font-medium text-slate-900 shadow hover:bg-amber-400"
              >
                Plan limit reached - View plans
              </a>
            )}
          </div>

          {!hasUnlimited && (
            <p className="text-xs text-slate-400">
              {invoiceCount} / {maxPerMonth} invoices used on {planId} plan.
            </p>
          )}
        </div>
      </div>

      <Table invoices={invoices} />

      <div className="mt-6 flex w-full justify-center">
        <Pagination totalPages={totalPages} />
      </div>
    </main>
  );
}
