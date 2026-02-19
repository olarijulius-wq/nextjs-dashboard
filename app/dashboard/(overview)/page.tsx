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
import { RevealOnMount } from '@/app/ui/motion/reveal';

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
  return (
    <main className="space-y-6">
      <h1 className={`${lusitana.className} text-xl text-slate-900 dark:text-slate-100 md:text-2xl`}>
        Dashboard
      </h1>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-6 sm:grid-cols-2">
          <Suspense fallback={<CardsSkeleton />}>
            <CardWrapper />
          </Suspense>
        </div>

        <Suspense
          fallback={
            <div className="h-full rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]" />
          }
        >
          <LatelessLiveView />
        </Suspense>
      </div>

      <div className="space-y-6">
        <RevealOnMount delay={0.08}>
          <Suspense fallback={<RevenueChartSkeleton />}>
            <RevenueChart />
          </Suspense>
        </RevealOnMount>

        <div className="grid gap-6 md:grid-cols-2">
          <RevealOnMount delay={0.14} className="h-full">
            <Suspense fallback={<LatestInvoicesSkeleton />}>
              <LatestInvoices />
            </Suspense>
          </RevealOnMount>
          <RevealOnMount delay={0.2} className="h-full">
            <Suspense fallback={<LatestInvoicesSkeleton />}>
              <LatePayers searchParams={searchParams} />
            </Suspense>
          </RevealOnMount>
        </div>
      </div>
    </main>
  );
}
