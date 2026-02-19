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

type RemindersAdminPanelProps = {
  runs: ReminderRunLogRecord[];
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

export default function RemindersAdminPanel({ runs }: RemindersAdminPanelProps) {
  const router = useRouter();
  const [isRunning, startTransition] = useTransition();
  const [runResult, setRunResult] = useState<RunNowResponse | null>(null);
  const [runError, setRunError] = useState<string>('');
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
    };
  }, [latestRun]);

  const latestRunNowSummary = pickSummary(runResult);

  const handleRunNow = () => {
    if (isRunning) {
      return;
    }

    setRunError('');
    startTransition(async () => {
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
        router.refresh();
      } catch {
        setRunResult(null);
        setRunError('Failed to run reminders.');
      }
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Last run summary
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Manual trigger for `/api/reminders/run?triggeredBy=manual`.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunNow}
            disabled={isRunning}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-black transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-100"
          >
            {isRunning ? 'Running...' : 'Run now'}
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
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Last 20 run logs from `public.reminder_runs`.
        </p>

        {runs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">No runs yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-[0.08em] text-slate-600 dark:bg-black dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">time</th>
                  <th className="px-3 py-2">triggered_by</th>
                  <th className="px-3 py-2">sent</th>
                  <th className="px-3 py-2">failed</th>
                  <th className="px-3 py-2">skipped</th>
                  <th className="px-3 py-2">has_more</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {runs.map((run) => (
                  <tr key={run.id} className="text-slate-800 dark:text-slate-200">
                    <td className="px-3 py-2">{formatTimestamp(run.ranAt)}</td>
                    <td className="px-3 py-2">{run.triggeredBy}</td>
                    <td className="px-3 py-2">{run.sent}</td>
                    <td className="px-3 py-2">{run.failed}</td>
                    <td className="px-3 py-2">{run.skipped}</td>
                    <td className="px-3 py-2">{run.hasMore ? 'true' : 'false'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
