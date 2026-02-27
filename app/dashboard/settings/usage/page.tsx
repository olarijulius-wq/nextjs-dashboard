import { Metadata } from 'next';
import { PLAN_CONFIG } from '@/app/lib/config';
import { fetchUserPlanAndUsage } from '@/app/lib/data';
import {
  fetchCurrentTallinnMonthWindow,
  fetchCurrentMonthInvoiceMetricCount,
  fetchInvoiceDailySeries,
  fetchUsageSummary,
  fetchUsageTopReasons,
  fetchUsageVerify,
  getUsageCapabilities,
  isUsageMigrationRequiredError,
  normalizeUsageInvoiceMetric,
  normalizeUsageInvoiceWindow,
  type InvoiceDailyPoint,
  type InvoiceDailyWindow,
  type InvoiceUsageMetric,
} from '@/app/lib/usage';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

export const metadata: Metadata = {
  title: 'Usage Settings',
};

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Tallinn',
  }).format(date);
}

function formatDateLabel(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function metricLabel(metric: InvoiceUsageMetric) {
  if (metric === 'created') return 'Created';
  if (metric === 'sent') return 'Sent (email)';
  if (metric === 'paid') return 'Paid';
  return 'Issued';
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

function getPeakPoint(points: InvoiceDailyPoint[]): InvoiceDailyPoint | null {
  if (points.length === 0) return null;
  return points.reduce<InvoiceDailyPoint>((peak, point) =>
    point.count > peak.count ? point : peak,
  points[0]);
}

function getTrend(points: InvoiceDailyPoint[]) {
  const last3 = points.slice(-3).reduce((acc, point) => acc + point.count, 0);
  const prev3 = points.slice(-6, -3).reduce((acc, point) => acc + point.count, 0);

  if (last3 > prev3) {
    return {
      label: 'Trend: up',
      title: `last 3 days ${last3} vs previous 3 days ${prev3}`,
    };
  }

  if (last3 < prev3) {
    return {
      label: 'Trend: down',
      title: `last 3 days ${last3} vs previous 3 days ${prev3}`,
    };
  }

  return {
    label: 'Trend: flat',
    title: `last 3 days ${last3} vs previous 3 days ${prev3}`,
  };
}

function buildUsageHref(input: {
  metric: InvoiceUsageMetric;
  win: InvoiceDailyWindow;
  showZeroDays: boolean;
  diagnosticsRequested: boolean;
}) {
  const params = new URLSearchParams();
  if (input.metric !== 'created') params.set('metric', input.metric);
  if (input.win !== '7d') params.set('win', input.win);
  if (input.showZeroDays) params.set('zeros', '1');
  if (input.diagnosticsRequested) params.set('diag', '1');

  const query = params.toString();
  return query
    ? `/dashboard/settings/usage?${query}`
    : '/dashboard/settings/usage';
}

export default async function UsageSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ metric?: string; win?: string; zeros?: string; diag?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const usage = await fetchUserPlanAndUsage();
  const plan = PLAN_CONFIG[usage.plan];
  const isUnlimited = !Number.isFinite(usage.maxPerMonth);
  const monthWindow = await fetchCurrentTallinnMonthWindow();

  const requestedMetric = normalizeUsageInvoiceMetric(resolvedSearchParams?.metric);
  const selectedWindow = normalizeUsageInvoiceWindow(resolvedSearchParams?.win);
  const showZeroDays = resolvedSearchParams?.zeros === '1';
  const diagnosticsRequested = resolvedSearchParams?.diag === '1';

  let usageMigrationRequired = false;
  let teamMigrationRequired = false;

  let summary = emptySummary();
  let topSkipReasons: { reason: string; count: number }[] = [];
  let invoicePoints: InvoiceDailyPoint[] = [];
  let diagnostics: Awaited<ReturnType<typeof fetchUsageVerify>> | null = null;

  let monthCreated = 0;
  let hasIssuedMetric = true;
  let hasPaidMetric = true;
  let activeMetric: InvoiceUsageMetric = requestedMetric;
  let canViewInternalDiagnostics = false;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    canViewInternalDiagnostics = isInternalAdmin(context.userEmail);

    const capabilities = await getUsageCapabilities();
    hasIssuedMetric = capabilities.hasIssuedMetric;
    hasPaidMetric = capabilities.hasPaidMetric;
    if (!hasIssuedMetric && activeMetric === 'issued') {
      activeMetric = 'created';
    }
    if (!hasPaidMetric && activeMetric === 'paid') {
      activeMetric = 'created';
    }

    const [summaryResult, monthCreatedResult, invoiceSeries, reasons, verify] =
      await Promise.all([
        fetchUsageSummary(
          context.workspaceId,
          context.userEmail,
          monthWindow.monthStart,
          monthWindow.monthEnd,
        ),
        fetchCurrentMonthInvoiceMetricCount({
          workspaceId: context.workspaceId,
          userEmail: context.userEmail,
          metric: 'created',
        }),
        fetchInvoiceDailySeries({
          workspaceId: context.workspaceId,
          userEmail: context.userEmail,
          metric: activeMetric,
          win: selectedWindow,
        }),
        fetchUsageTopReasons({
          workspaceId: context.workspaceId,
          userEmail: context.userEmail,
          monthStart: monthWindow.monthStart,
          monthEnd: monthWindow.monthEnd,
        }),
        fetchUsageVerify({
          workspaceId: context.workspaceId,
          userEmail: context.userEmail,
          metric: activeMetric,
        }),
      ]);

    summary = summaryResult;
    monthCreated = monthCreatedResult.count;
    invoicePoints = invoiceSeries.points;
    topSkipReasons = reasons;
    diagnostics = verify;
  } catch (error) {
    if (isUsageMigrationRequiredError(error)) {
      usageMigrationRequired = true;
    } else if (isTeamMigrationRequiredError(error)) {
      teamMigrationRequired = true;
    } else {
      throw error;
    }
  }

  const canViewDiagnostics = canViewInternalDiagnostics;

  const displayedInvoicePoints = showZeroDays
    ? [...invoicePoints].reverse()
    : [...invoicePoints].filter((point) => point.count > 0).reverse();
  const peakPoint = getPeakPoint(invoicePoints);
  const trend = getTrend(invoicePoints);

  const mainMetricOptions = (['created', 'sent', 'paid'] as const).filter(
    (metric) => metric !== 'paid' || hasPaidMetric,
  );

  const monthlyInvoicesUsed = monthCreated;
  const usageSubtext = isUnlimited
    ? `Invoices created this month: ${monthlyInvoicesUsed}`
    : `Invoices created this month: ${monthlyInvoicesUsed} / ${usage.maxPerMonth}`;

  const currentHref = buildUsageHref({
    metric: activeMetric,
    win: selectedWindow,
    showZeroDays,
    diagnosticsRequested,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Usage</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {formatMonthLabel(monthWindow.monthStart)}. Invoices created this month.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Usage counters reset each month for your current plan period.
        </p>
      </header>

      {(usageMigrationRequired || teamMigrationRequired) && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          {usageMigrationRequired
            ? 'Usage analytics is unavailable until migration 017_add_usage_events.sql is applied.'
            : 'Workspace context is unavailable until team migrations are applied.'}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Invoices</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{usageSubtext}</p>
            </div>
            <div className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-slate-700 dark:border-neutral-700 dark:text-slate-300" title={trend.title}>
              {trend.label}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {mainMetricOptions.map((metric) => {
              const active = activeMetric === metric;
              return (
                <a
                  key={metric}
                  href={buildUsageHref({
                    metric,
                    win: selectedWindow,
                    showZeroDays,
                    diagnosticsRequested,
                  })}
                  className={`rounded-full border px-2 py-1 transition ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                      : 'border-neutral-300 text-slate-600 hover:border-slate-500 hover:text-slate-900 dark:border-neutral-700 dark:text-slate-300 dark:hover:border-slate-300 dark:hover:text-slate-100'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {metricLabel(metric)}
                </a>
              );
            })}

            {(['7d', '30d'] as const).map((win) => {
              const active = selectedWindow === win;
              return (
                <a
                  key={win}
                  href={buildUsageHref({
                    metric: activeMetric,
                    win,
                    showZeroDays,
                    diagnosticsRequested,
                  })}
                  className={`rounded-full border px-2 py-1 transition ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                      : 'border-neutral-300 text-slate-600 hover:border-slate-500 hover:text-slate-900 dark:border-neutral-700 dark:text-slate-300 dark:hover:border-slate-300 dark:hover:text-slate-100'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {win}
                </a>
              );
            })}

            <a
              href={buildUsageHref({
                metric: activeMetric,
                win: selectedWindow,
                showZeroDays: !showZeroDays,
                diagnosticsRequested,
              })}
              className={`rounded-full border px-2 py-1 transition ${
                showZeroDays
                  ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                  : 'border-neutral-300 text-slate-600 hover:border-slate-500 hover:text-slate-900 dark:border-neutral-700 dark:text-slate-300 dark:hover:border-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Show zero days
            </a>
          </div>

          {hasIssuedMetric && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                Advanced
              </summary>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="rounded-full border border-amber-300 px-2 py-0.5 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                  Advanced
                </span>
                <a
                  href={buildUsageHref({
                    metric: 'issued',
                    win: selectedWindow,
                    showZeroDays,
                    diagnosticsRequested,
                  })}
                  className={`rounded-full border px-2 py-1 transition ${
                    activeMetric === 'issued'
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                      : 'border-neutral-300 text-slate-600 hover:border-slate-500 hover:text-slate-900 dark:border-neutral-700 dark:text-slate-300 dark:hover:border-slate-300 dark:hover:text-slate-100'
                  }`}
                  aria-current={activeMetric === 'issued' ? 'page' : undefined}
                >
                  {metricLabel('issued')}
                </a>
              </div>
            </details>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {peakPoint && peakPoint.count > 0 ? (
              <span className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-slate-700 dark:border-neutral-700 dark:text-slate-300">
                Peak: {formatDateLabel(peakPoint.date)} ({peakPoint.count})
              </span>
            ) : (
              <span className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-slate-700 dark:border-neutral-700 dark:text-slate-300">
                Peak: none
              </span>
            )}
          </div>

          {displayedInvoicePoints.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
              No activity in selected window.
            </p>
          ) : (
            <ul className="mt-4 space-y-1">
              {displayedInvoicePoints.map((point) => (
                <li
                  key={point.date}
                  className="flex items-center justify-between rounded-xl border border-neutral-200/80 px-3 py-2 text-sm dark:border-neutral-800"
                >
                  <span className="text-slate-700 dark:text-slate-300">{formatDateLabel(point.date)}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {point.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reminders</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            This month: sent {summary.reminder_sent}, skipped {summary.reminder_skipped}, errors{' '}
            {summary.reminder_error}
          </p>

          <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <p>
              Plan:{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{plan.name}</span>
            </p>
            <p>
              Reminders:{' '}
              {plan.hasReminders
                ? 'Included in this plan.'
                : 'Upgrade required for automatic reminders.'}
            </p>
            <p>
              Window: {monthWindow.monthStartDate} to {monthWindow.monthEndDate} ({monthWindow.timezone})
            </p>
            {!isUnlimited && (
              <p>
                Monthly invoice limit: {monthlyInvoicesUsed} / {usage.maxPerMonth}
              </p>
            )}
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Top skipped reasons
            </h3>

            {topSkipReasons.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No skipped reminders this month.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
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
          </div>
        </section>
      </div>

      {canViewDiagnostics && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-100">
              Diagnostics (dev)
            </summary>
            {diagnostics ? (
              <pre className="mt-3 overflow-x-auto rounded-xl border border-neutral-200/80 bg-neutral-50 p-3 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-300">
                {JSON.stringify(diagnostics, null, 2)}
              </pre>
            ) : (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                Diagnostics unavailable.
              </p>
            )}
          </details>
        </section>
      )}

      {currentHref !== '/dashboard/settings/usage' && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <a href="/dashboard/settings/usage" className="underline underline-offset-2">
            Reset filters
          </a>
        </div>
      )}
    </div>
  );
}
