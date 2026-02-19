import { lusitana } from '@/app/ui/fonts';
import {
  fetchLatePayerPages,
  fetchLatePayerStats,
  fetchUserPlanAndUsage,
  type LatePayerSortDir,
  type LatePayerSortKey,
} from '@/app/lib/data';
import { PLAN_CONFIG } from '@/app/lib/config';
import Link from 'next/link';
import { toolbarButtonClasses } from '@/app/ui/button';
import LatePayersControls from '@/app/ui/dashboard/late-payers-controls';
import Pagination from '@/app/ui/invoices/pagination';

function formatDelay(days: number) {
  const rounded = Math.round(days);
  return `+${rounded} days late`;
}

type LatePayersSearchParams = {
  lpQuery?: string;
  lpPage?: string;
  lpSort?: string;
  lpDir?: string;
  lpPageSize?: string;
};

export default async function LatePayers({
  searchParams,
}: {
  searchParams?: LatePayersSearchParams;
}) {
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

  const isEmpty = !latePayers || latePayers.length === 0;

  return (
    <div className="flex w-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        {canView ? (
          <>
            <Link
              href="/dashboard/late-payers"
              className={`${lusitana.className} text-xl text-slate-900 hover:text-slate-700 dark:text-slate-100 dark:hover:text-white md:text-2xl`}
            >
              Late payers
            </Link>
            <Link
              href="/dashboard/late-payers"
              className={`${toolbarButtonClasses} h-9 px-3 text-xs`}
            >
              View all late payers
            </Link>
          </>
        ) : (
          <>
            <h2 className={`${lusitana.className} text-xl text-slate-900 dark:text-slate-100 md:text-2xl`}>
              Late payers
            </h2>
            <div className="flex flex-col items-end gap-1">
              <span
                className={`${toolbarButtonClasses} h-9 cursor-not-allowed px-3 text-xs text-slate-400 opacity-60 hover:scale-100 hover:bg-slate-950/60 hover:text-slate-400`}
                aria-disabled="true"
                title="Available on Solo, Pro, and Studio plans"
              >
                View all late payers
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Available on Solo, Pro, and Studio plans.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex grow flex-col rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        {!canView ? (
          <div className="rounded-xl border border-neutral-200 bg-slate-50 p-6 dark:border-zinc-800 dark:bg-black">
            <p className="text-sm text-slate-900 dark:text-slate-100">
              See which clients consistently pay late and how many days they
              delay payments.
            </p>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Available on Solo, Pro, and Studio.
            </p>
            <Link
              href="/dashboard/settings"
              className={`${toolbarButtonClasses} mt-4 h-9 px-3 text-xs`}
            >
              View plans
            </Link>
          </div>
        ) : (
          <>
            <LatePayersControls
              sortKey={sortKey}
              sortDir={sortDir}
              pageSize={pageSize}
            />

            {isEmpty ? (
              <div className="mt-4 rounded-xl border border-neutral-200 bg-slate-50 p-6 dark:border-zinc-800 dark:bg-black">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  No late payer data yet. Late payments will appear here.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="space-y-3 md:hidden">
                  {latePayers.map((payer) => (
                    <Link
                      key={payer.customer_id}
                      href={`/dashboard/customers/${payer.customer_id}`}
                      className="block rounded-xl border border-neutral-200 bg-white p-4 text-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-black dark:text-slate-100 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]"
                    >
                      <div className="flex justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-xs text-slate-600 dark:text-slate-400">Customer</p>
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {payer.name}
                          </p>
                          <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                            {payer.email}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <div className="text-right">
                            <p className="text-xs text-slate-600 dark:text-slate-400">Paid invoices</p>
                            <p className="text-sm text-emerald-800 dark:text-emerald-300">
                              {payer.paid_invoices}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-600 dark:text-slate-400">Avg delay</p>
                            <p className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-300">
                              {formatDelay(payer.avg_delay_days).replace('+', '')} late
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="hidden rounded-xl border border-neutral-200 bg-slate-50 md:block dark:border-zinc-800 dark:bg-black">
                  <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-neutral-200 px-4 py-3 text-xs uppercase tracking-[0.12em] text-slate-500 dark:border-zinc-800">
                    <span>Name</span>
                    <span>Email</span>
                    <span className="text-right">Stats</span>
                  </div>
                  <div className="max-h-72 divide-y divide-neutral-200 overflow-y-auto dark:divide-zinc-800">
                    {latePayers.map((payer) => (
                      <Link
                        key={payer.customer_id}
                        href={`/dashboard/customers/${payer.customer_id}`}
                        className="flex flex-col gap-2 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-neutral-900 md:flex-row md:items-center md:justify-between"
                      >
                        <span className="min-w-0 font-medium text-slate-900 dark:text-slate-100 md:w-[30%] md:truncate">
                          {payer.name}
                        </span>
                        <span className="min-w-0 text-slate-600 dark:text-slate-400 md:w-[40%] md:truncate">
                          {payer.email}
                        </span>
                        <span className="text-xs md:w-[30%] md:text-right">
                          <span className="text-emerald-800 dark:text-emerald-300">
                            {payer.paid_invoices} invoices
                          </span>
                          {', '}
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-300">
                            avg {formatDelay(payer.avg_delay_days)}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 flex w-full justify-center">
              <Pagination totalPages={totalPages} pageParam="lpPage" />
            </div>
          </>
        )}

        {canView && (
          <div className="mt-4 flex justify-end">
            <Link
              href="/dashboard/late-payers"
              className="text-xs text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Open late payers
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
