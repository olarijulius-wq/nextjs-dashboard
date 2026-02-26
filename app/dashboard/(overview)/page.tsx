import RevenueChart from '@/app/ui/dashboard/revenue-chart';
import LatestInvoices from '@/app/ui/dashboard/latest-invoices';
import LatePayers from '@/app/ui/dashboard/late-payers';
import { LatelessLiveView } from '@/app/ui/dashboard/live-view';
import { lusitana } from '@/app/ui/fonts';
import { Suspense } from 'react';
import CardWrapper from '@/app/ui/dashboard/cards';
import {
  RevenueChartSkeleton,
  LatestInvoicesSkeleton,
  CardsSkeleton,
} from '@/app/ui/skeletons';
import { Metadata } from 'next';
import { fetchSetupStateForCurrentUser } from '@/app/lib/setup-state';
import DashboardSetupCard from '@/app/ui/dashboard/setup-card';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function Page(props: {
  searchParams?: Promise<{
    lpQuery?: string;
    lpPage?: string;
    lpSort?: string;
    lpDir?: string;
    lpPageSize?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const setup = await fetchSetupStateForCurrentUser();

  const setupItems: Array<{
    key: string;
    title: string;
    description: string;
    href: string;
    ctaLabel: string;
    done: boolean;
  }> = [
    {
      key: 'company',
      title: 'Add company details',
      description: 'Business identity shown on invoices.',
      href: '/dashboard/settings/company-profile',
      ctaLabel: 'Open company profile',
      done: setup.companyDone,
    },
    {
      key: 'customer',
      title: 'Add first customer',
      description: 'Create one customer to start billing.',
      href: '/dashboard/customers/create',
      ctaLabel: 'Create customer',
      done: setup.customerDone,
    },
    {
      key: 'invoice',
      title: 'Create first invoice',
      description: 'Generate your first payable invoice.',
      href: '/dashboard/invoices/create',
      ctaLabel: 'Create invoice',
      done: setup.invoiceDone,
    },
    {
      key: 'send',
      title: 'Send invoice',
      description: 'Send one invoice and confirm it was delivered.',
      href: '/dashboard/invoices',
      ctaLabel: 'Open invoices',
      done: setup.invoiceSentDone,
    },
  ];

  return (
    <main className="space-y-6">
      <h1 className={`${lusitana.className} text-xl text-slate-900 dark:text-slate-100 md:text-2xl`}>
        Dashboard
      </h1>

      <DashboardSetupCard items={setupItems} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 [&>*]:min-h-[150px]">
              <CardsSkeleton />
            </div>
          }
        >
          <CardWrapper />
        </Suspense>

        <Suspense
          fallback={
            <div className="h-full min-h-[236px] rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]" />
          }
        >
          <LatelessLiveView />
        </Suspense>
      </div>

      <div className="space-y-6">
        <Suspense
          fallback={
            <div className="min-h-[500px]">
              <RevenueChartSkeleton />
            </div>
          }
        >
          <RevenueChart />
        </Suspense>

        <div className="grid gap-6 md:grid-cols-2">
          <Suspense
            fallback={
              <div className="h-full min-h-[420px]">
                <LatestInvoicesSkeleton />
              </div>
            }
          >
            <LatestInvoices />
          </Suspense>
          <Suspense
            fallback={
              <div className="h-full min-h-[420px]">
                <LatestInvoicesSkeleton />
              </div>
            }
          >
            <LatePayers searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
