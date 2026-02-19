import { Metadata } from 'next';
import CustomersTable from '@/app/ui/customers/table';
import {
  fetchCustomersPages,
  fetchFilteredCustomers,
  fetchUserPlanAndUsage,
  type CustomerSortDir,
  type CustomerSortKey,
} from '@/app/lib/data';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/app/ui/button';
import { lusitana } from '@/app/ui/fonts';
import ExportCustomersButton from './export-button';
import { PLAN_CONFIG } from '@/app/lib/config';
import { RevealOnMount } from '@/app/ui/motion/reveal';
import MobileExpandableSearchToolbar from '@/app/ui/dashboard/mobile-expandable-search-toolbar';
import { auth } from '@/auth';
import CustomersListControls from '@/app/ui/customers/list-controls';
import Pagination from '@/app/ui/invoices/pagination';
import CustomersUpdatedToast from '@/app/ui/customers/updated-toast';

export const metadata: Metadata = {
  title: 'Customers',
};

export default async function Page(props: {
  searchParams?: Promise<{
    query?: string;
    page?: string;
    sort?: string;
    dir?: string;
    pageSize?: string;
    highlight?: string;
    updated?: string;
    updatedCustomer?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || '';
  const currentPage = Number(searchParams?.page) > 0 ? Number(searchParams?.page) : 1;
  const sortKey: CustomerSortKey =
    searchParams?.sort === 'name' ||
    searchParams?.sort === 'email' ||
    searchParams?.sort === 'created_at' ||
    searchParams?.sort === 'total_invoices'
      ? searchParams.sort
      : 'name';
  const sortDir: CustomerSortDir =
    searchParams?.dir === 'asc' || searchParams?.dir === 'desc'
      ? searchParams.dir
      : 'asc';
  const pageSize =
    searchParams?.pageSize === '10' ||
    searchParams?.pageSize === '25' ||
    searchParams?.pageSize === '50' ||
    searchParams?.pageSize === '100'
      ? Number(searchParams.pageSize)
      : 50;
  const highlight = searchParams?.highlight?.trim() || '';
  const isUpdated = searchParams?.updated === '1';
  const updatedCustomerId =
    searchParams?.updatedCustomer?.trim() || highlight || '';
  const session = await auth();
  if (!session?.user?.email) {
    const callbackParams = new URLSearchParams();
    if (query) callbackParams.set('query', query);
    if (searchParams?.sort) callbackParams.set('sort', searchParams.sort);
    if (searchParams?.dir) callbackParams.set('dir', searchParams.dir);
    if (searchParams?.page) callbackParams.set('page', searchParams.page);
    if (searchParams?.pageSize) callbackParams.set('pageSize', searchParams.pageSize);
    const callbackUrl = callbackParams.toString()
      ? `/dashboard/customers?${callbackParams.toString()}`
      : '/dashboard/customers';
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const returnToParams = new URLSearchParams();
  if (query) returnToParams.set('query', query);
  if (searchParams?.sort) returnToParams.set('sort', searchParams.sort);
  if (searchParams?.dir) returnToParams.set('dir', searchParams.dir);
  if (searchParams?.page) returnToParams.set('page', searchParams.page);
  if (searchParams?.pageSize) returnToParams.set('pageSize', searchParams.pageSize);
  const returnToPath =
    returnToParams.toString().length > 0
      ? `/dashboard/customers?${returnToParams.toString()}`
      : '/dashboard/customers';

  const [customers, totalPages, plan] = await Promise.all([
    fetchFilteredCustomers(query, currentPage, pageSize, sortKey, sortDir),
    fetchCustomersPages(query, pageSize),
    fetchUserPlanAndUsage(),
  ]);
  const canExportCsv = PLAN_CONFIG[plan.plan].canExportCsv;

  return (
    <div className="w-full">
      <RevealOnMount>
        {/* Title */}
        <h1
          className={`${lusitana.className} mb-3 text-xl text-slate-900 dark:text-slate-100 md:text-2xl`}
        >
          Customers
        </h1>

        <MobileExpandableSearchToolbar
          searchPlaceholder="Search customers..."
          actions={
            <>
              <ExportCustomersButton canExportCsv={canExportCsv} />
              <Link href="/dashboard/customers/create" className="shrink-0">
                <Button variant="toolbar">
                  Create customer
                </Button>
              </Link>
            </>
          }
        />
      </RevealOnMount>

      {/* Table */}
      <RevealOnMount delay={0.12}>
        <CustomersUpdatedToast visible={isUpdated} customerId={updatedCustomerId} />
        <CustomersListControls
          sortKey={sortKey}
          sortDir={sortDir}
          pageSize={pageSize}
        />
        <CustomersTable
          customers={customers}
          highlightedCustomerId={highlight}
          returnToPath={returnToPath}
        />
        <div className="mt-6 flex w-full justify-center">
          <Pagination totalPages={totalPages} />
        </div>
      </RevealOnMount>
    </div>
  );
}
