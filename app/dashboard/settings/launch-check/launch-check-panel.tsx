'use client';

import { useMemo, useState } from 'react';
import { Button, secondaryButtonClasses } from '@/app/ui/button';

type CheckStatus = 'pass' | 'fail' | 'warn';

type LaunchCheckResult = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fixHint: string;
};

type LaunchCheckPayload = {
  ok: boolean;
  env: {
    nodeEnv: string | null;
    vercelEnv: string | null;
    siteUrlResolved: string;
  };
  checks: LaunchCheckResult[];
  raw: Record<string, unknown>;
};

type LaunchCheckRunRecord = {
  ranAt: string;
  actorEmail: string;
  env: string;
  payload: LaunchCheckPayload;
};

type PingPayload = {
  ok: boolean;
  lastRun: LaunchCheckRunRecord | null;
};

function formatRunTime(value: string | null | undefined, timezone: string) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
}

function statusChip(status: CheckStatus) {
  if (status === 'pass') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200';
  }
  if (status === 'warn') {
    return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200';
  }
  return 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200';
}

export default function LaunchCheckPanel({
  initialLastRun,
  timezone,
}: {
  initialLastRun: LaunchCheckRunRecord | null;
  timezone: string;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LaunchCheckPayload | null>(initialLastRun?.payload ?? null);
  const [lastRun, setLastRun] = useState<LaunchCheckRunRecord | null>(initialLastRun);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!result) return null;
    const counts = { pass: 0, warn: 0, fail: 0 };
    for (const check of result.checks) {
      counts[check.status] += 1;
    }
    return counts;
  }, [result]);

  async function refreshLastRunFromPing() {
    const pingRes = await fetch('/api/settings/launch-check/ping', { method: 'GET' });
    if (!pingRes.ok) return;
    const pingPayload = (await pingRes.json().catch(() => null)) as PingPayload | null;
    if (!pingPayload?.ok) return;
    if (pingPayload.lastRun) {
      setLastRun(pingPayload.lastRun);
      setResult(pingPayload.lastRun.payload);
    }
  }

  async function runChecks() {
    setRunning(true);
    setError(null);

    try {
      const runRes = await fetch('/api/settings/launch-check/run', {
        method: 'POST',
      });
      const payload = (await runRes.json().catch(() => null)) as LaunchCheckPayload | null;

      if (!runRes.ok || !payload) {
        setError('Failed to run launch readiness checks.');
        return;
      }

      setResult(payload);
      await refreshLastRunFromPing();
    } catch {
      setError('Failed to run launch readiness checks.');
    } finally {
      setRunning(false);
    }
  }

  async function copyReport() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    } catch {
      setError('Copy failed.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Last run: <span className="font-medium">{formatRunTime(lastRun?.ranAt, timezone)}</span>
          </p>
          {result ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Resolved site URL: {result.env.siteUrlResolved}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={runChecks} aria-disabled={running}>
            {running ? 'Running…' : 'Run checks'}
          </Button>
          <button
            type="button"
            onClick={copyReport}
            disabled={!result}
            className={`${secondaryButtonClasses} h-10 px-3`}
          >
            Copy report
          </button>
        </div>
      </div>

      {summary ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {result?.ok ? 'PASS' : 'FAIL'} · {summary.pass} pass · {summary.warn} warn · {summary.fail} fail
        </p>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          <thead className="bg-neutral-50 dark:bg-neutral-900/50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Check</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Detail</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Fix hint</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
            {result?.checks?.map((check) => (
              <tr key={check.id}>
                <td className="px-4 py-3 align-top text-slate-900 dark:text-slate-100">{check.title}</td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${statusChip(check.status)}`}
                  >
                    {check.status}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-slate-700 dark:text-slate-300">{check.detail}</td>
                <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">{check.fixHint}</td>
              </tr>
            ))}
            {!result ? (
              <tr>
                <td className="px-4 py-6 text-slate-500 dark:text-slate-400" colSpan={4}>
                  No checks run yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {result ? (
        <details className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">
            Diagnostics
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-black/90 p-3 text-xs text-neutral-100">
            {JSON.stringify(result.raw, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
