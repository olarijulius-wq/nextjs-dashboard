'use client';

import { useMemo, useState } from 'react';
import { Button, secondaryButtonClasses } from '@/app/ui/button';

type LaunchCheckStatus = 'pass' | 'warn' | 'fail';
type SmokeCheckStatus = 'pass' | 'warn' | 'fail' | 'manual';

type LaunchCheckResult = {
  id: string;
  title: string;
  status: LaunchCheckStatus;
  detail: string;
  fixHint: string;
};

type SmokeCheckResult = {
  id: string;
  title: string;
  status: SmokeCheckStatus;
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

type SmokeCheckPayload = {
  kind: 'smoke_run';
  ok: boolean;
  env: {
    nodeEnv: string | null;
    vercelEnv: string | null;
    siteUrl: string;
  };
  checks: SmokeCheckResult[];
  raw: Record<string, unknown>;
};

type LaunchCheckRunRecord = {
  ranAt: string;
  actorEmail: string;
  env: string;
  payload: LaunchCheckPayload;
};

type SmokeCheckRunRecord = {
  ranAt: string;
  actorEmail: string;
  workspaceId: string | null;
  env: {
    node_env: string | null;
    vercel_env: string | null;
    site_url: string;
  };
  payload: SmokeCheckPayload;
  ok: boolean;
};

type LaunchPingPayload = {
  ok: boolean;
  lastRun: LaunchCheckRunRecord | null;
};

type SmokePingPayload = {
  ok: boolean;
  lastRun: SmokeCheckRunRecord | null;
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

function formatIso(value: string | null | undefined) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toISOString();
}

function addCounts(counts: { pass: number; warn: number; fail: number; manual: number }, status: string) {
  if (status === 'pass') counts.pass += 1;
  if (status === 'warn') counts.warn += 1;
  if (status === 'fail') counts.fail += 1;
  if (status === 'manual') counts.manual += 1;
}

export default function AllChecksPanel({
  initialLaunchLastRun,
  initialSmokeLastRun,
  timezone,
}: {
  initialLaunchLastRun: LaunchCheckRunRecord | null;
  initialSmokeLastRun: SmokeCheckRunRecord | null;
  timezone: string;
}) {
  const [running, setRunning] = useState(false);
  const [launchLastRun, setLaunchLastRun] = useState<LaunchCheckRunRecord | null>(initialLaunchLastRun);
  const [smokeLastRun, setSmokeLastRun] = useState<SmokeCheckRunRecord | null>(initialSmokeLastRun);
  const [launchResult, setLaunchResult] = useState<LaunchCheckPayload | null>(
    initialLaunchLastRun?.payload ?? null,
  );
  const [smokeResult, setSmokeResult] = useState<SmokeCheckPayload | null>(
    initialSmokeLastRun?.payload ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const summary = useMemo(() => {
    const counts = { pass: 0, warn: 0, fail: 0, manual: 0 };
    for (const check of launchResult?.checks ?? []) {
      addCounts(counts, check.status);
    }
    for (const check of smokeResult?.checks ?? []) {
      addCounts(counts, check.status);
    }
    const status = counts.fail > 0 ? 'FAIL' : counts.warn > 0 ? 'WARN' : 'PASS';
    return { status, ...counts };
  }, [launchResult, smokeResult]);

  async function refreshFromPing() {
    const [launchPingRes, smokePingRes] = await Promise.all([
      fetch('/api/settings/launch-check/ping', { method: 'GET' }),
      fetch('/api/settings/smoke-check/ping', { method: 'GET' }),
    ]);
    if (launchPingRes.ok) {
      const payload = (await launchPingRes.json().catch(() => null)) as LaunchPingPayload | null;
      if (payload?.ok && payload.lastRun) {
        setLaunchLastRun(payload.lastRun);
        setLaunchResult(payload.lastRun.payload);
      }
    }
    if (smokePingRes.ok) {
      const payload = (await smokePingRes.json().catch(() => null)) as SmokePingPayload | null;
      if (payload?.ok && payload.lastRun) {
        setSmokeLastRun(payload.lastRun);
        setSmokeResult(payload.lastRun.payload);
      }
    }
  }

  async function runAllChecks() {
    setRunning(true);
    setError(null);
    setNote(null);
    try {
      const [launchRunRes, smokeRunRes] = await Promise.all([
        fetch('/api/settings/launch-check/run', { method: 'POST' }),
        fetch('/api/settings/smoke-check/run', { method: 'POST' }),
      ]);
      const launchPayload = (await launchRunRes.json().catch(() => null)) as LaunchCheckPayload | null;
      const smokePayload = (await smokeRunRes.json().catch(() => null)) as SmokeCheckPayload | null;
      if (!launchRunRes.ok || !smokeRunRes.ok || !launchPayload || !smokePayload) {
        setError('Failed to run all checks.');
        return;
      }
      setLaunchResult(launchPayload);
      setSmokeResult(smokePayload);
      await refreshFromPing();
      setNote('All checks completed.');
    } catch {
      setError('Failed to run all checks.');
    } finally {
      setRunning(false);
    }
  }

  function buildMarkdownReport() {
    const lines: string[] = [];
    lines.push('# Lateless launch + smoke check report');
    lines.push('');
    lines.push(`Generated at: ${new Date().toISOString()}`);
    lines.push(`Overall: ${summary.status}`);
    lines.push(
      `Summary: PASS ${summary.pass} | WARN ${summary.warn} | FAIL ${summary.fail} | MANUAL ${summary.manual}`,
    );
    lines.push('');
    lines.push('## Last run');
    lines.push(`- Launch checks: ${formatIso(launchLastRun?.ranAt)}`);
    lines.push(`- Smoke checks: ${formatIso(smokeLastRun?.ranAt)}`);
    lines.push('');

    lines.push('## Launch checks');
    if (!launchResult?.checks?.length) {
      lines.push('- No launch check run found.');
    } else {
      for (const check of launchResult.checks) {
        lines.push(`- [${check.status.toUpperCase()}] ${check.title}: ${check.detail}`);
      }
    }
    lines.push('');

    lines.push('## Smoke checks');
    if (!smokeResult?.checks?.length) {
      lines.push('- No smoke check run found.');
    } else {
      for (const check of smokeResult.checks) {
        lines.push(`- [${check.status.toUpperCase()}] ${check.title}: ${check.detail}`);
      }
    }
    lines.push('');

    return lines.join('\n');
  }

  async function copyMarkdownReport() {
    try {
      await navigator.clipboard.writeText(buildMarkdownReport());
      setNote('Markdown report copied.');
      setError(null);
    } catch {
      setError('Copy failed.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Launch last run: <span className="font-medium">{formatRunTime(launchLastRun?.ranAt, timezone)}</span>
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Smoke last run: <span className="font-medium">{formatRunTime(smokeLastRun?.ranAt, timezone)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={runAllChecks} aria-disabled={running}>
            {running ? 'Running…' : 'Run all checks'}
          </Button>
          <button
            type="button"
            onClick={copyMarkdownReport}
            className={`${secondaryButtonClasses} h-10 px-3`}
            disabled={!launchResult && !smokeResult}
          >
            Copy markdown report
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        {summary.status} · {summary.pass} pass · {summary.warn} warn · {summary.fail} fail · {summary.manual} manual
      </p>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}
      {note ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200">
          {note}
        </div>
      ) : null}
    </div>
  );
}
