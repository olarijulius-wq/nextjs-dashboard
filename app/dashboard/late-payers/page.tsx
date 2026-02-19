import { Metadata } from 'next';
import Link from 'next/link';
import {
  fetchLatePayerPages,
  fetchLatePayerStats,
  fetchUserPlanAndUsage,
  type LatePayerSortDir,
  type LatePayerSortKey,
} from '@/app/lib/data';
import { PLAN_CONFIG } from '@/app/lib/config';
import { lusitana } from '@/app/ui/fonts';
import { toolbarButtonClasses } from '@/app/ui/button';
import { RevealOnMount } from '@/app/ui/motion/reveal';
import LatePayersControls from '@/app/ui/dashboard/late-payers-controls';
import Pagination from '@/app/ui/invoices/pagination';

export const metadata: Metadata = {
  title: 'Late payers',
};

function formatDelay(days: number) {
  const rounded = Math.round(days * 10) / 10;
  return `+${rounded} days`;
}

type LatePayersPageSearchParams = {
  lpQuery?: string;
  lpPage?: string;
  lpSort?: string;
  lpDir?: string;
  lpPageSize?: string;
};

export default async function Page(props: {
  searchParams?: Promise<LatePayersPageSearchParams>;
}) {
  const searchParams = await props.searchParams;
  const { plan } = await fetchUserPlanAndUsage();
  const canView = PLAN_CONFIG[plan].hasLatePayerAnalytics;

  const query = searchParams?.lpQuery || '';
  const currentPage = Number(searchParams?.lpPage) > 0 ? Number(searchParams?.lpPage) : 1;
  const sortKey: LatePayerSortKey =
    searchParams?.lpSort === 'days_overdue' ||
    searchParams?.lpSort === 'paid_invoices' ||
    searchParams?.lpSort === 'name' ||
    searchParams?.lpSort === 'email' ||
    searchParams?.lpSort === 'amount'
      ? searchParams.lpSort
      : 'days_overdue';
  const sortDir: LatePayerSortDir =
    searchParams?.lpDir === 'asc' || searchParams?.lpDir === 'desc'
      ? searchParams.lpDir
      : 'desc';
  const pageSize =
    searchParams?.lpPageSize === '25' ||
    searchParams?.lpPageSize === '50' ||
    searchParams?.lpPageSize === '100' ||
    searchParams?.lpPageSize === '200'
      ? Number(searchParams.lpPageSize)
      : 100;

  const [latePayers, totalPages] = canView
    ? await Promise.all([
        fetchLatePayerStats(currentPage, pageSize, sortKey, sortDir, query),
        fetchLatePayerPages(query, pageSize),
      ])
    : [[], 0];
  const isEmpty = latePayers.length === 0;
  const totalLatePayers = latePayers.length;

  return (
    <div className="space-y-4">
      <RevealOnMount>
        <div>
          <h1 className={`${lusitana.className} mb-2 text-xl text-slate-900 dark:text-slate-100 md:text-2xl`}>
            Late payers
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Customers who pay invoices after the due date.
          </p>
        </div>

        {!canView ? (
          <div className="rounded-xl border border-amber-300 bg-amber-100 p-6 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">Late payer analytics is a Solo+ feature.</p>
            <p className="mt-2 text-amber-800 dark:text-amber-100/80">
              Upgrade to see which customers consistently pay late and how many
              days they delay payments.
            </p>
            <Link
              href="/dashboard/settings"
              className={`${toolbarButtonClasses} mt-4 h-9 px-3 text-xs`}
            >
              View plans
            </Link>
          </div>
        ) : (
          <RevealOnMount delay={0.12}>
            <>
              <div className="md:hidden">
                <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4 text-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Late payers
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {totalLatePayers} late payers
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Clients with paid invoices that were settled after the due date.
                  </p>
                </div>
              </div>

              <LatePayersControls
                sortKey={sortKey}
                sortDir={sortDir}
                pageSize={pageSize}
              />

              {isEmpty ? (
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                  No late payers yet. Once some clients start paying late, they’ll show
                  up here with their average delay.
                </p>
              ) : (
                <>
                  <div className="mt-4 space-y-3 md:hidden">
                    {latePayers.map((payer) => (
                      <Link
                        key={payer.customer_id}
                        href={`/dashboard/customers/${payer.customer_id}`}
                        className="block rounded-xl border border-neutral-200 bg-white p-4 text-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]"
                      >
                        <div className="flex justify-between gap-4">
                          <div className="flex-1 space-y-1">
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Customer
                            </p>
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {payer.name}
                            </p>
                            <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                              {payer.email}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <div className="text-right">
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Paid invoices
                              </p>
                              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                                {payer.paid_invoices}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Avg delay
                              </p>
                              <p className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-300">
                                {formatDelay(payer.avg_delay_days).replace('+', '')} late
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>

                  <div className="hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.06)] md:block dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
                    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_140px_160px] gap-4 border-b border-neutral-200 px-6 py-3 text-xs uppercase tracking-[0.12em] text-slate-500 dark:border-neutral-800">
                      <span>Customer</span>
                      <span>Email</span>
                      <span className="text-right">Paid invoices</span>
                      <span className="text-right">Avg delay</span>
                    </div>
                    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {latePayers.map((payer) => (
                        <Link
                          key={payer.customer_id}
                          href={`/dashboard/customers/${payer.customer_id}`}
                          className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_140px_160px] items-center gap-4 px-6 py-4 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-neutral-900"
                        >
                          <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                            {payer.name}
                          </span>
                          <span className="truncate text-slate-600 dark:text-slate-400">{payer.email}</span>
                          <span className="text-right text-emerald-800 dark:text-emerald-300">
                            {payer.paid_invoices}
                          </span>
                          <span className="text-right">
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-300">
                              {formatDelay(payer.avg_delay_days)}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="mt-6 flex w-full justify-center">
                <Pagination totalPages={totalPages} pageParam="lpPage" />
              </div>
            </>
          </RevealOnMount>
        )}
      </RevealOnMount>
    </div>
  );
}
