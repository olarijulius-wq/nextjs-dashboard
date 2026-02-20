import { Metadata } from 'next';
import { PLAN_CONFIG } from '@/app/lib/config';
import { fetchUserPlanAndUsage } from '@/app/lib/data';
import {
  fetchUsageSummary,
  fetchUsageTimeseries,
  fetchUsageTopReasons,
  isUsageMigrationRequiredError,
  normalizeUsageInvoiceMetric,
} from '@/app/lib/usage';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';

export const metadata: Metadata = {
  title: 'Usage Settings',
};

function getCurrentMonthRange(now: Date) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return { monthStart, monthEnd };
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDateLabel(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function emptySummary() {
  return {
    invoice_created: 0,
    invoice_updated: 0,
    reminder_sent: 0,
    reminder_skipped: 0,
    reminder_error: 0,
    unsubscribe: 0,
    resubscribe: 0,
    smtp_test_sent: 0,
  };
}

export default async function UsageSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ metric?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const usage = await fetchUserPlanAndUsage();
  const plan = PLAN_CONFIG[usage.plan];
  const isUnlimited = !Number.isFinite(usage.maxPerMonth);
  const { monthStart, monthEnd } = getCurrentMonthRange(new Date());
  const invoiceMetric = normalizeUsageInvoiceMetric(resolvedSearchParams?.metric);

  let summary = emptySummary();
  let timeseries: Awaited<ReturnType<typeof fetchUsageTimeseries>> = {
    points: [],
    debug: {
      scopeKey: 'user_email',
      normalizedDateColumn: 'invoices.created_at',
      timezone: 'Europe/Tallinn',
      invoiceMetric,
    },
  };
  let topSkipReasons: Awaited<ReturnType<typeof fetchUsageTopReasons>> = [];
  let usageMigrationRequired = false;
  let teamMigrationRequired = false;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    [summary, timeseries, topSkipReasons] = await Promise.all([
      fetchUsageSummary(context.workspaceId, monthStart, monthEnd),
      fetchUsageTimeseries({
        workspaceId: context.workspaceId,
        userEmail: context.userEmail,
        days: 30,
        invoiceMetric,
      }),
      fetchUsageTopReasons(context.workspaceId, monthStart, monthEnd),
    ]);
  } catch (error) {
    if (isUsageMigrationRequiredError(error)) {
      usageMigrationRequired = true;
    } else if (isTeamMigrationRequiredError(error)) {
      teamMigrationRequired = true;
    } else {
      throw error;
    }
  }

  const hasTimeseriesData = timeseries.points.some(
    (point) =>
      point.invoiceCreated > 0 ||
      point.reminderSent > 0 ||
      point.reminderSkipped > 0 ||
      point.reminderError > 0,
  );

  return (
    <div className="space-y-6">
      {(usageMigrationRequired || teamMigrationRequired) && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          {usageMigrationRequired
            ? 'Usage analytics is unavailable until migration 017_add_usage_events.sql is applied.'
            : 'Workspace context is unavailable until team migrations are applied.'}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            This month
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {formatMonthLabel(monthStart)}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-neutral-200/80 p-3 dark:border-neutral-800">
              <dt className="text-slate-500 dark:text-slate-400">Invoices created</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {summary.invoice_created}
              </dd>
            </div>
            <div className="rounded-xl border border-neutral-200/80 p-3 dark:border-neutral-800">
              <dt className="text-slate-500 dark:text-slate-400">Reminders sent</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {summary.reminder_sent}
              </dd>
            </div>
            <div className="rounded-xl border border-neutral-200/80 p-3 dark:border-neutral-800">
              <dt className="text-slate-500 dark:text-slate-400">Skipped</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {summary.reminder_skipped}
              </dd>
            </div>
            <div className="rounded-xl border border-neutral-200/80 p-3 dark:border-neutral-800">
              <dt className="text-slate-500 dark:text-slate-400">Errors</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {summary.reminder_error}
              </dd>
            </div>
            <div className="rounded-xl border border-neutral-200/80 p-3 dark:border-neutral-800 col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">Unsubscribes</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {summary.unsubscribe}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Plan &amp; limits
          </h2>

          <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>
              Current plan:{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {plan.name}
              </span>
            </p>
            {isUnlimited ? (
              <p>Monthly invoice limit: Unlimited</p>
            ) : (
              <p>
                Monthly invoices used: {usage.invoiceCount} / {usage.maxPerMonth}
              </p>
            )}
            <p>
              Reminders:{' '}
              {plan.hasReminders
                ? 'Included in this plan.'
                : 'Upgrade required for automatic reminders.'}
            </p>
            <p>
              Analytics window: {monthStart.toISOString().slice(0, 10)} to{' '}
              {monthEnd.toISOString().slice(0, 10)}.
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Last 30 days
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Daily counts for invoice creation and reminders.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Invoice metric:</span>
          {(['created', 'sent', 'paid'] as const).map((metric) => {
            const active = invoiceMetric === metric;
            return (
              <a
                key={metric}
                href={`/dashboard/settings/usage?metric=${metric}`}
                className={`rounded-full border px-2 py-1 transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-neutral-300 text-slate-600 hover:border-slate-500 hover:text-slate-900 dark:border-neutral-700 dark:text-slate-300 dark:hover:border-slate-300 dark:hover:text-slate-100'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {metric}
              </a>
            );
          })}
        </div>
        {process.env.NODE_ENV === 'development' ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Debug: scope={timeseries.debug.scopeKey}, date_column=
            {timeseries.debug.normalizedDateColumn}, timezone={timeseries.debug.timezone},
            metric={timeseries.debug.invoiceMetric}
          </p>
        ) : null}

        {!hasTimeseriesData ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            No usage events in the last 30 days yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Invoices</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Skipped</th>
                  <th className="px-3 py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {[...timeseries.points].reverse().map((point) => (
                  <tr
                    key={point.date}
                    className="border-t border-neutral-200/70 text-slate-700 dark:border-neutral-800 dark:text-slate-300"
                  >
                    <td className="px-3 py-2">{formatDateLabel(point.date)}</td>
                    <td className="px-3 py-2">{point.invoiceCreated}</td>
                    <td className="px-3 py-2">{point.reminderSent}</td>
                    <td className="px-3 py-2">{point.reminderSkipped}</td>
                    <td className="px-3 py-2">{point.reminderError}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Top skipped reasons
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Most common reminder skip reasons in the current month.
        </p>

        {topSkipReasons.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            No skipped reminders this month.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {topSkipReasons.map((item) => (
              <li
                key={item.reason}
                className="flex items-center justify-between rounded-xl border border-neutral-200/80 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <span className="capitalize text-slate-700 dark:text-slate-300">
                  {item.reason.replace('_', ' ')}
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
