'use client';

import { useMemo, useState } from 'react';
import { Button, secondaryButtonClasses } from '@/app/ui/button';

type CheckStatus = 'pass' | 'warn' | 'fail' | 'manual';

type SmokeCheckResult = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fixHint: string;
  actionLabel?: string;
  actionUrl?: string;
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

type SmokeCheckEmailPreview = {
  provider: 'resend' | 'smtp';
  effectiveFromHeader: string;
  fromHeaderValid: boolean;
  retryAfterSec: number | null;
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

type PingPayload = {
  ok: boolean;
  lastRun: SmokeCheckRunRecord | null;
  emailPreview?: SmokeCheckEmailPreview;
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
  if (status === 'manual') {
    return 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-200';
  }
  return 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200';
}

export default function SmokeCheckPanel({
  initialLastRun,
  initialEmailPreview,
  timezone,
}: {
  initialLastRun: SmokeCheckRunRecord | null;
  initialEmailPreview: SmokeCheckEmailPreview | null;
  timezone: string;
}) {
  const [running, setRunning] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [result, setResult] = useState<SmokeCheckPayload | null>(initialLastRun?.payload ?? null);
  const [lastRun, setLastRun] = useState<SmokeCheckRunRecord | null>(initialLastRun);
  const [emailPreview, setEmailPreview] = useState<SmokeCheckEmailPreview | null>(initialEmailPreview);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!result) return null;
    const counts = { pass: 0, warn: 0, fail: 0, manual: 0 };
    for (const check of result.checks) {
      counts[check.status] += 1;
    }
    return counts;
  }, [result]);

  async function refreshLastRun() {
    const pingRes = await fetch('/api/settings/smoke-check/ping', { method: 'GET' });
    if (!pingRes.ok) return;
    const ping = (await pingRes.json().catch(() => null)) as PingPayload | null;
    if (!ping?.ok) return;
    if (ping.lastRun) {
      setLastRun(ping.lastRun);
      setResult(ping.lastRun.payload);
    }
    setEmailPreview(ping.emailPreview ?? null);
  }

  async function runChecks() {
    setRunning(true);
    setError(null);
    setWarning(null);
    setNote(null);
    try {
      const runRes = await fetch('/api/settings/smoke-check/run', { method: 'POST' });
      const payload = (await runRes.json().catch(() => null)) as SmokeCheckPayload | null;
      if (!runRes.ok || !payload) {
        setError('Failed to run production smoke checks.');
        return;
      }
      setResult(payload);
      await refreshLastRun();
    } catch {
      setError('Failed to run production smoke checks.');
    } finally {
      setRunning(false);
    }
  }

  async function sendTestEmail() {
    setSendingTestEmail(true);
    setError(null);
    setWarning(null);
    setNote(null);
    try {
      const response = await fetch('/api/settings/smoke-check/test-email', {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; rateLimited?: boolean; message?: string; retryAfterSec?: number; error?: string }
        | null;

      if (!response.ok && !payload) {
        setError('Failed to send test email.');
        return;
      }

      if (response.status === 429 || payload?.rateLimited) {
        const retryAfterSec = payload?.retryAfterSec;
        setWarning(payload?.message ?? `Rate limited — retry in ${retryAfterSec ?? 1}s.`);
        await refreshLastRun();
        return;
      }

      if (!response.ok) {
        setError(payload?.message ?? payload?.error ?? 'Failed to send test email.');
        return;
      }

      setNote(payload?.message ?? 'Test email sent.');
      await refreshLastRun();
    } catch {
      setError('Failed to send test email.');
    } finally {
      setSendingTestEmail(false);
    }
  }

  async function copyReport() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setNote('Report copied.');
      setWarning(null);
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
              Resolved site URL: {result.env.siteUrl}
            </p>
          ) : null}
          {emailPreview ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Effective from header: <span className="font-mono">{emailPreview.effectiveFromHeader}</span>{' '}
              · {emailPreview.fromHeaderValid ? 'valid' : 'invalid'}
              {emailPreview.retryAfterSec ? ` · retry in ${emailPreview.retryAfterSec}s` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={runChecks} aria-disabled={running}>
            {running ? 'Running…' : 'Run checks'}
          </Button>
          <button
            type="button"
            onClick={sendTestEmail}
            disabled={sendingTestEmail || (emailPreview ? !emailPreview.fromHeaderValid : false)}
            className={`${secondaryButtonClasses} h-10 px-3`}
          >
            {sendingTestEmail ? 'Sending…' : 'Send test email'}
          </button>
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
          {result?.ok ? 'PASS' : 'FAIL'} · {summary.pass} pass · {summary.warn} warn · {summary.fail} fail ·{' '}
          {summary.manual} manual
        </p>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {warning ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusChip('warn')}`}
          >
            WARN
          </span>
          <span>{warning}</span>
        </div>
      ) : null}

      {note ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200">
          {note}
        </div>
      ) : null}
      {emailPreview && !emailPreview.fromHeaderValid ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
          Send test email is disabled until from-header is valid: {emailPreview.effectiveFromHeader}
        </div>
      ) : null}

      <details className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">
          Verify DNS (SPF, DKIM, DMARC)
        </summary>
        <div className="mt-3 space-y-2">
          <details className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">
              SPF
            </summary>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Add/update your root TXT record to include your sender provider (for Resend, include their SPF include target), then wait for DNS propagation.
            </p>
          </details>
          <details className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">
              DKIM
            </summary>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Publish the DKIM CNAME/TXT selectors exactly as shown in your provider dashboard, then verify the domain there once records resolve.
            </p>
          </details>
          <details className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">
              DMARC
            </summary>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Add a TXT record at <span className="font-mono">_dmarc.yourdomain.com</span>, start with policy <span className="font-mono">p=none</span>, and include report addresses before tightening policy.
            </p>
          </details>
        </div>
      </details>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          <thead className="bg-neutral-50 dark:bg-neutral-900/50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Check</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Detail</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Fix hint</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-950">
            {result?.checks?.map((check) => {
              const isExternal = check.actionUrl?.startsWith('http');
              return (
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
                  <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">
                    {check.actionUrl ? (
                      <a
                        href={check.actionUrl}
                        target={isExternal ? '_blank' : undefined}
                        rel={isExternal ? 'noreferrer noopener' : undefined}
                        className="inline-flex h-8 items-center rounded-lg border border-neutral-300 px-2 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                      >
                        {check.actionLabel ?? 'Open'}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
            {!result ? (
              <tr>
                <td className="px-4 py-6 text-slate-500 dark:text-slate-400" colSpan={5}>
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
