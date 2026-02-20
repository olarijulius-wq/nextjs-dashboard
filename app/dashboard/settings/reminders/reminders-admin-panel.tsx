'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ReminderRunLogRecord } from '@/app/lib/reminder-run-logs';

type RunNowResponse = {
  attempted?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  hasMore?: boolean;
  durationMs?: number;
  ranAt?: string;
  runLogWritten?: boolean;
  runLogWarning?: string | null;
  error?: string;
};

type FixLogsResponse = {
  ok?: boolean;
  fixed?: {
    workspaceIdFilled?: number;
    userEmailFilled?: number;
  };
  warning?: string | null;
  error?: string;
};

type DiagnosticsPayload = {
  schema: {
    hasWorkspaceId: boolean;
    hasUserEmail: boolean;
    hasActorEmail: boolean;
    hasConfig: boolean;
    rawJsonType: string | null;
  };
  counts: {
    totalRuns: number;
    workspaceScopedRuns: number;
    cronRunsMissingWorkspaceId: number;
    rowsMissingUserEmail: number;
    totalBadRows: number;
  };
  samples: Array<{
    id: string;
    ranAt: string;
    triggeredBy: string;
    sent: number;
    workspaceId: string | null;
    userEmail: string | null;
    candidateWorkspaceIds: string[];
    updatedInvoiceIdsLength: number;
  }>;
};

type RemindersAdminPanelProps = {
  runs: ReminderRunLogRecord[];
  activeWorkspaceId: string | null;
  activeUserEmail: string | null;
  scopeMode: 'workspace' | 'account';
  diagnostics: DiagnosticsPayload | null;
};

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function pickSummary(payload: RunNowResponse | null) {
  if (!payload) {
    return null;
  }

  return {
    attempted: payload.attempted ?? 0,
    sent: payload.sent ?? 0,
    failed: payload.failed ?? 0,
    skipped: payload.skipped ?? 0,
    hasMore: Boolean(payload.hasMore),
    durationMs: payload.durationMs ?? 0,
    ranAt: payload.ranAt ?? new Date().toISOString(),
  };
}

function getRawObject(latestRun: ReminderRunLogRecord | null) {
  const raw = latestRun?.rawJson;
  return raw && typeof raw === 'object' ? raw : null;
}

function getSkippedTopReasonBadge(run: ReminderRunLogRecord) {
  const raw = getRawObject(run);
  const summary =
    raw && typeof raw.summary === 'object' && raw.summary !== null
      ? (raw.summary as Record<string, unknown>)
      : null;
  const skippedBreakdown =
    summary &&
    typeof summary.skippedBreakdown === 'object' &&
    summary.skippedBreakdown !== null
      ? (summary.skippedBreakdown as Record<string, unknown>)
      : null;

  if (!skippedBreakdown) {
    return null;
  }

  const items = [
    { label: 'paused', count: Number(skippedBreakdown.paused ?? 0) },
    { label: 'unsubscribed', count: Number(skippedBreakdown.unsubscribed ?? 0) },
    { label: 'missing email', count: Number(skippedBreakdown.missing_email ?? 0) },
    { label: 'not eligible', count: Number(skippedBreakdown.not_eligible ?? 0) },
    { label: 'other', count: Number(skippedBreakdown.other ?? 0) },
  ].sort((a, b) => b.count - a.count);

  const top = items[0];
  if (!top || top.count <= 0) {
    return null;
  }

  return `Top skip: ${top.label} (${top.count})`;
}

function hasNoEligibleOverdueInvoices(run: ReminderRunLogRecord) {
  if (run.sent !== 0) {
    return false;
  }

  const raw = getRawObject(run);
  const candidates = Array.isArray(raw?.candidates) ? raw.candidates : [];
  return candidates.length === 0;
}

function getDryRunLabel(run: ReminderRunLogRecord) {
  if (run.config) {
    return run.config.dryRun ? 'yes' : 'no';
  }

  const raw = getRawObject(run);
  return raw?.dryRun === true ? 'yes' : 'no';
}

function getBatchThrottle(run: ReminderRunLogRecord) {
  const config = run.config;
  if (!config) {
    return '—';
  }

  return `${config.batchSize} / ${config.throttleMs}ms`;
}

function getShortWorkspaceId(value: string | null) {
  if (!value) {
    return '—';
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatConfig(config: ReminderRunLogRecord['config']) {
  if (!config) {
    return '—';
  }

  return `${config.batchSize}/${config.throttleMs}/${config.maxRunMs}`;
}

function getZeroSentExplanation(latestRun: ReminderRunLogRecord | null): string | null {
  if (!latestRun || latestRun.sent > 0) {
    return null;
  }

  if (hasNoEligibleOverdueInvoices(latestRun)) {
    return 'No eligible overdue invoices.';
  }

  const topReason = getSkippedTopReasonBadge(latestRun);
  if (topReason) {
    return topReason;
  }

  return null;
}

export default function RemindersAdminPanel({
  runs,
  activeWorkspaceId,
  activeUserEmail,
  scopeMode,
  diagnostics,
}: RemindersAdminPanelProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunNowResponse | null>(null);
  const [runError, setRunError] = useState<string>('');
  const [fixResult, setFixResult] = useState<string>('');
  const [isFixing, setIsFixing] = useState(false);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(new Set());
  const latestRun = runs[0] ?? null;

  const latestRunSummary = useMemo(() => {
    if (!latestRun) {
      return null;
    }

    return {
      attempted: latestRun.attempted,
      sent: latestRun.sent,
      failed: latestRun.failed,
      skipped: latestRun.skipped,
      hasMore: latestRun.hasMore,
      durationMs: latestRun.durationMs,
      ranAt: latestRun.ranAt,
      triggeredBy: latestRun.triggeredBy,
      actorEmail: latestRun.actorEmail,
      config: latestRun.config,
    };
  }, [latestRun]);

  const latestRunNowSummary = pickSummary(runResult);
  const zeroSentExplanation = getZeroSentExplanation(latestRun);

  const handleRunNow = () => {
    if (isRunning) {
      return;
    }

    setRunError('');
    setIsRunning(true);
    void (async () => {
      try {
        const response = await fetch('/api/reminders/run-manual', {
          method: 'POST',
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => null)) as RunNowResponse | null;
        if (!response.ok) {
          setRunResult(null);
          setRunError(payload?.error ?? 'Failed to run reminders.');
          return;
        }

        setRunResult(payload);
        if (payload?.runLogWarning) {
          setRunError(`Run warning: ${payload.runLogWarning}`);
        }
        startTransition(() => {
          router.refresh();
        });
      } catch {
        setRunResult(null);
        setRunError('Failed to run reminders.');
      } finally {
        setIsRunning(false);
      }
    })();
  };

  const toggleDetails = (runId: string) => {
    setExpandedRunIds((previous) => {
      const next = new Set(previous);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const handleFixLogs = () => {
    if (isFixing) {
      return;
    }

    setIsFixing(true);
    setFixResult('');
    setRunError('');
    void (async () => {
      try {
        const response = await fetch('/api/reminders/fix-logs', {
          method: 'POST',
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as FixLogsResponse | null;
        if (!response.ok || !payload?.ok) {
          setFixResult(payload?.error ?? 'Failed to fix historical rows.');
          return;
        }

        const workspaceIdFilled = payload.fixed?.workspaceIdFilled ?? 0;
        const userEmailFilled = payload.fixed?.userEmailFilled ?? 0;
        const fixedTotal = workspaceIdFilled + userEmailFilled;
        const baseMessage =
          fixedTotal > 0
            ? `Fixed ${fixedTotal} rows (workspace_id: ${workspaceIdFilled}, user_email: ${userEmailFilled}).`
            : 'No rows needed fix.';
        setFixResult(payload.warning ? `${baseMessage} Warning: ${payload.warning}` : baseMessage);
        startTransition(() => {
          router.refresh();
        });
      } catch {
        setFixResult('Failed to fix historical rows.');
      } finally {
        setIsFixing(false);
      }
    })();
  };

  return (
    <div className="space-y-4">
      <details className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <summary className="cursor-pointer list-none text-base font-semibold text-slate-900 dark:text-slate-100">
          Diagnostics
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Scope target: {scopeMode === 'workspace' ? activeWorkspaceId ?? '—' : activeUserEmail ?? '—'}
          </p>
          {diagnostics ? (
            <div className="grid gap-3 md:grid-cols-2">
              <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-neutral-800 dark:bg-black dark:text-neutral-200">
                {JSON.stringify(diagnostics.schema, null, 2)}
              </pre>
              <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-neutral-800 dark:bg-black dark:text-neutral-200">
                {JSON.stringify(diagnostics.counts, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">Diagnostics unavailable.</p>
          )}
          {diagnostics && diagnostics.samples.length > 0 ? (
            <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-neutral-800 dark:bg-black dark:text-neutral-200">
              {JSON.stringify(diagnostics.samples, null, 2)}
            </pre>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleFixLogs}
              disabled={isFixing || isRefreshing}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-black transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-100"
            >
              {isFixing || isRefreshing ? 'Fixing...' : 'Fix historical rows'}
            </button>
            {fixResult ? (
              <p className="text-sm text-slate-700 dark:text-slate-300">{fixResult}</p>
            ) : null}
          </div>
        </div>
      </details>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Last run summary
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Manual trigger for `/api/reminders/run?triggeredBy=manual`.
            </p>
            {zeroSentExplanation ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {zeroSentExplanation}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleRunNow}
            disabled={isRunning || isRefreshing}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-black transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-100"
          >
            {isRunning || isRefreshing ? 'Running...' : 'Run now'}
          </button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
              Persisted latest run
            </p>
            <pre className="mt-1 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-neutral-800 dark:bg-black dark:text-neutral-200">
              {JSON.stringify(latestRunSummary, null, 2) || 'null'}
            </pre>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
              Current manual run result
            </p>
            <pre className="mt-1 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-neutral-800 dark:bg-black dark:text-neutral-200">
              {JSON.stringify(latestRunNowSummary, null, 2) || 'null'}
            </pre>
          </div>
        </div>

        {latestRunNowSummary?.hasMore ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            More remaining - run again to continue.
          </p>
        ) : null}

        {runError ? (
          <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{runError}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Recent runs
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span>Last 20 run logs from `public.reminder_runs`.</span>
          <span className="inline-flex rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-neutral-700 dark:text-slate-300">
            Scope: {scopeMode === 'workspace' ? 'This workspace' : 'This account'}
          </span>
          {scopeMode === 'workspace' && activeWorkspaceId ? (
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {activeWorkspaceId}
            </span>
          ) : null}
        </div>

        {runs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">No runs yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-[0.08em] text-slate-600 dark:bg-black dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">time</th>
                  <th className="px-3 py-2">triggered_by</th>
                  <th className="px-3 py-2">workspace_id</th>
                  <th className="px-3 py-2">user_email</th>
                  <th className="px-3 py-2">actor</th>
                  <th className="px-3 py-2">config</th>
                  <th className="px-3 py-2">dryRun</th>
                  <th className="px-3 py-2">batch/throttle</th>
                  <th className="px-3 py-2">sent</th>
                  <th className="px-3 py-2">failed</th>
                  <th className="px-3 py-2">skipped</th>
                  <th className="px-3 py-2">has_more</th>
                  <th className="px-3 py-2">notes</th>
                  <th className="px-3 py-2">details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {runs.map((run) => {
                  const isExpanded = expandedRunIds.has(run.id);
                  const noEligibleBadge = hasNoEligibleOverdueInvoices(run)
                    ? 'No eligible overdue invoices'
                    : null;
                  const topReasonBadge = getSkippedTopReasonBadge(run);

                  return [
                    <tr key={`row-${run.id}`} className="text-slate-800 dark:text-slate-200">
                        <td className="px-3 py-2">{formatTimestamp(run.ranAt)}</td>
                        <td className="px-3 py-2">{run.triggeredBy}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {getShortWorkspaceId(run.workspaceId)}
                        </td>
                        <td className="px-3 py-2">{run.userEmail ?? '—'}</td>
                        <td className="px-3 py-2">
                          {run.actorEmail ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {formatConfig(run.config)}
                        </td>
                        <td className="px-3 py-2">{getDryRunLabel(run)}</td>
                        <td className="px-3 py-2">{getBatchThrottle(run)}</td>
                        <td className="px-3 py-2">{run.sent}</td>
                        <td className="px-3 py-2">{run.failed}</td>
                        <td className="px-3 py-2">{run.skipped}</td>
                        <td className="px-3 py-2">{run.hasMore ? 'true' : 'false'}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {noEligibleBadge ? (
                              <span className="inline-flex rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                {noEligibleBadge}
                              </span>
                            ) : null}
                            {topReasonBadge ? (
                              <span className="inline-flex rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                                {topReasonBadge}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleDetails(run.id)}
                            className="inline-flex rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-slate-300 dark:hover:bg-neutral-900"
                          >
                            {isExpanded ? 'Hide' : 'Details'}
                          </button>
                        </td>
                    </tr>,
                    isExpanded ? (
                      <tr key={`details-${run.id}`}>
                        <td colSpan={14} className="bg-neutral-50 px-3 py-2 dark:bg-black/30">
                          <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-800 dark:border-neutral-800 dark:bg-black dark:text-neutral-200">
                            {JSON.stringify(run.rawJson, null, 2) || 'null'}
                          </pre>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
