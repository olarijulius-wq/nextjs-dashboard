import { Metadata } from 'next';
import Link from 'next/link';
import { fetchLatePayerStats, fetchUserPlanAndUsage } from '@/app/lib/data';
import { PLAN_CONFIG } from '@/app/lib/config';
import { lusitana } from '@/app/ui/fonts';

export const metadata: Metadata = {
  title: 'Late payers',
};

function formatDelay(days: number) {
  const rounded = Math.round(days * 10) / 10;
  return `+${rounded} days`;
}

export default async function Page() {
  const { plan } = await fetchUserPlanAndUsage();
  const canView = PLAN_CONFIG[plan].hasLatePayerAnalytics;
  const latePayers = canView ? await fetchLatePayerStats(1000) : [];
  const isEmpty = !latePayers || latePayers.length === 0;
  const totalLatePayers = latePayers.length;
  const averageDelay = totalLatePayers
    ? latePayers.reduce((sum, payer) => sum + payer.avg_delay_days, 0) / totalLatePayers
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className={`${lusitana.className} mb-2 text-xl md:text-2xl`}>
          Late payers
        </h1>
        <p className="text-sm text-slate-400">
          Customers who pay invoices after the due date.
        </p>
      </div>

      {!canView ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
          <p className="font-semibold">Late payer analytics is a Solo+ feature.</p>
          <p className="mt-2 text-amber-100/80">
            Upgrade to see which customers consistently pay late and how many
            days they delay payments.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-4 inline-flex items-center rounded-md bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm shadow-amber-900/30 transition hover:bg-amber-300"
          >
            View plans
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-white p-4 text-sm dark:bg-neutral-900 md:hidden">
            <p className="text-slate-500 dark:text-slate-400">You have</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {totalLatePayers} late payers
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Average delay {formatDelay(averageDelay)}
            </p>
          </div>

          {isEmpty ? (
            <>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-200 md:hidden">
                No late payers yet. Once clients start paying invoices late, they’ll
                appear here.
              </div>
              <div className="hidden rounded-md border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-200 md:block">
                No late payers yet. Once clients start paying invoices late, they’ll
                appear here.
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 space-y-3 md:hidden">
                {latePayers.map((payer) => (
                  <Link
                    key={payer.customer_id}
                    href={`/dashboard/customers/${payer.customer_id}`}
                    className="w-full space-y-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-slate-100"
                  >
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400">Customer</p>
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {payer.name}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-slate-400">Email</p>
                      <p className="truncate text-sm text-slate-200">
                        {payer.email}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-slate-400">Paid invoices</p>
                      <p className="text-sm text-slate-100">
                        {payer.paid_invoices}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-slate-400">Avg delay</p>
                      <p className="text-sm text-amber-200">
                        {formatDelay(payer.avg_delay_days).replace('+', '')} late
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="hidden rounded-md border border-slate-800 bg-slate-900/80 md:block">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_140px_160px] gap-4 border-b border-slate-800 px-6 py-3 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <span>Customer</span>
                  <span>Email</span>
                  <span className="text-right">Paid invoices</span>
                  <span className="text-right">Avg delay</span>
                </div>
                <div className="divide-y divide-slate-800">
                  {latePayers.map((payer) => (
                    <Link
                      key={payer.customer_id}
                      href={`/dashboard/customers/${payer.customer_id}`}
                      className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_140px_160px] items-center gap-4 px-6 py-4 text-sm text-slate-200 transition hover:bg-slate-900"
                    >
                      <span className="truncate font-semibold text-slate-100">
                        {payer.name}
                      </span>
                      <span className="truncate text-slate-400">{payer.email}</span>
                      <span className="text-right text-slate-300">
                        {payer.paid_invoices}
                      </span>
                      <span className="text-right text-amber-200">
                        {formatDelay(payer.avg_delay_days)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
