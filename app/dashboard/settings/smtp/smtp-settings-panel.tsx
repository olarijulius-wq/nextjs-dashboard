'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/ui/button';
import type { EmailProviderMode, WorkspaceEmailSettings } from '@/app/lib/smtp-settings';
import type { EffectiveMailConfig } from '@/app/lib/email';
import {
  SETTINGS_CHECKBOX_CLASSES,
  SETTINGS_INPUT_CLASSES,
  SETTINGS_SELECT_CLASSES,
} from '@/app/ui/form-control';

type ApiState = {
  canEdit: boolean;
  userRole: 'owner' | 'admin' | 'member';
  settings: WorkspaceEmailSettings;
};

const defaultSettings: WorkspaceEmailSettings = {
  provider: 'resend',
  smtpHost: '',
  smtpPort: null,
  smtpSecure: false,
  smtpUsername: '',
  smtpPasswordPresent: false,
  fromName: '',
  fromEmail: '',
  replyTo: '',
};

type SmtpSettingsPanelProps = {
  initialSettings?: WorkspaceEmailSettings;
  mailConfig?: EffectiveMailConfig;
  canEdit?: boolean;
  userRole?: 'owner' | 'admin' | 'member';
  canViewInternalDebug?: boolean;
  migrationMessage?: string | null;
};

export default function SmtpSettingsPanel({
  initialSettings,
  mailConfig,
  canEdit: initialCanEdit = false,
  userRole: initialUserRole = 'member',
  canViewInternalDebug = false,
  migrationMessage = null,
}: SmtpSettingsPanelProps) {
  const router = useRouter();
  const baseSettings = initialSettings ?? defaultSettings;
  const [data, setData] = useState<ApiState | null>(
    initialSettings
      ? {
          canEdit: initialCanEdit,
          userRole: initialUserRole,
          settings: initialSettings,
        }
      : null,
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [provider, setProvider] = useState<EmailProviderMode>(baseSettings.provider);
  const [smtpHost, setSmtpHost] = useState(baseSettings.smtpHost);
  const [smtpPort, setSmtpPort] = useState(
    baseSettings.smtpPort ? String(baseSettings.smtpPort) : '',
  );
  const [smtpSecure, setSmtpSecure] = useState(baseSettings.smtpSecure);
  const [smtpUsername, setSmtpUsername] = useState(baseSettings.smtpUsername);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [fromName, setFromName] = useState(baseSettings.fromName);
  const [fromEmail, setFromEmail] = useState(baseSettings.fromEmail);
  const [replyTo, setReplyTo] = useState(baseSettings.replyTo);
  const [smtpPasswordPresent, setSmtpPasswordPresent] = useState(
    baseSettings.smtpPasswordPresent,
  );
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const canEdit = data?.canEdit ?? false;
  const status = useMemo(() => {
    if (!mailConfig) return { label: 'WARN', className: 'border-amber-300 bg-amber-50 text-amber-900', hint: 'Reload page to refresh checks.' };
    const inProduction = process.env.NODE_ENV === 'production';
    const fail =
      (inProduction && mailConfig.problems.includes('MAIL_FROM_EMAIL missing')) ||
      (mailConfig.provider === 'resend' && mailConfig.problems.includes('RESEND_API_KEY missing')) ||
      (mailConfig.provider === 'smtp' && mailConfig.problems.some((problem) => problem.startsWith('smtp')));
    if (fail) {
      return {
        label: 'FAIL',
        className: 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-200',
        hint: `Fix ${mailConfig.problems[0] ?? 'mail configuration'} and retry.`,
      };
    }
    if (mailConfig.problems.length > 0) {
      return {
        label: 'WARN',
        className: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200',
        hint: `Fix ${mailConfig.problems[0]} when promoting to production.`,
      };
    }
    return {
      label: 'PASS',
      className: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200',
      hint: 'Verify domain in Resend dashboard and run test email.',
    };
  }, [mailConfig]);

  const maskedFrom = useMemo(() => {
    const email = (mailConfig?.fromEmail ?? '').trim();
    if (!email) return 'Not set';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const lead = local.slice(0, 2);
    return `${lead}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
  }, [mailConfig?.fromEmail]);

  function syncForm(settings: WorkspaceEmailSettings) {
    setProvider(settings.provider);
    setSmtpHost(settings.smtpHost);
    setSmtpPort(settings.smtpPort ? String(settings.smtpPort) : '');
    setSmtpSecure(settings.smtpSecure);
    setSmtpUsername(settings.smtpUsername);
    setSmtpPassword('');
    setFromName(settings.fromName);
    setFromEmail(settings.fromEmail);
    setReplyTo(settings.replyTo);
    setSmtpPasswordPresent(settings.smtpPasswordPresent);
  }

  const showSmtpFields = provider === 'smtp';
  const canSendTestEmail =
    (data?.userRole === 'owner' || data?.userRole === 'admin') &&
    testStatus !== 'sending';

  const disabledFieldClass = useMemo(
    () =>
      !canEdit
        ? 'opacity-70 cursor-not-allowed'
        : '',
    [canEdit],
  );

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setMessage(null);

    startTransition(async () => {
      const payload = {
        provider,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUsername,
        smtpPassword,
        fromName,
        fromEmail,
        replyTo,
      };

      const res = await fetch('/api/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; settings?: WorkspaceEmailSettings }
        | null;

      if (!res.ok || !body?.ok || !body.settings) {
        setMessage({
          ok: false,
          text: body?.message ?? 'Failed to save SMTP settings.',
        });
        return;
      }

      const nextSettings = body.settings;
      setMessage({ ok: true, text: 'SMTP settings saved.' });
      setSmtpPassword('');
      syncForm(nextSettings);
      setData((previous) =>
        previous
          ? { ...previous, settings: nextSettings }
          : {
              canEdit: initialCanEdit,
              userRole: initialUserRole,
              settings: nextSettings,
            },
      );
      router.refresh();
    });
  }

  async function handleSendTestEmail() {
    setMessage(null);
    setTestStatus('sending');
    setTestMessage(null);
    try {
      const res = await fetch('/api/settings/smtp/test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; error?: string }
        | null;

      if (!res.ok || !body?.ok) {
        setTestStatus('failed');
        setTestMessage(body?.message ?? body?.error ?? 'Failed.');
      } else {
        setTestStatus('sent');
        setTestMessage(body?.message ?? 'Sent.');
      }
    } catch {
      setTestStatus('failed');
      setTestMessage('Failed.');
    }
  }

  if (migrationMessage) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-amber-500/40 dark:bg-amber-500/10 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          SMTP requires database migration
        </h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-100">{migrationMessage}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Email setup</h2>
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">
          Failed to load SMTP settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {canViewInternalDebug ? (
        <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Email setup</h2>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                Verify sender identity and run a safe mailbox test.
              </p>
            </div>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${status.className}`}>
              {status.label}
            </span>
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Provider</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {mailConfig?.provider === 'smtp' ? 'SMTP' : 'Resend'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">From address</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">{maskedFrom}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Reply-to</p>
              <p className="font-medium text-slate-900 dark:text-slate-100">{mailConfig?.replyTo ?? 'Not set'}</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-400">{status.hint}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Verify domain in Resend dashboard; publish SPF/DKIM/DMARC in DNS; then run test email.
          </p>

          <details className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
            <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">
              Deliverability checklist
            </summary>
            <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p>
                SPF (MANUAL): publish TXT at your root domain.
                <code className="ml-1 rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">v=spf1 include:&lt;provider&gt; ~all</code>
              </p>
              <p>
                DKIM (MANUAL): publish provider DKIM selector TXT/CNAME records from your provider dashboard.
              </p>
              <p>
                DMARC (MANUAL): publish TXT at <code>_dmarc.yourdomain.com</code>
                <code className="ml-1 rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">v=DMARC1; p=none; rua=mailto:postmaster@yourdomain.com</code>
              </p>
              <a
                href="https://resend.com/docs/dashboard/domains/introduction"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-8 items-center rounded-lg border border-neutral-300 px-2 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Open Resend docs
              </a>
            </div>
          </details>
        </section>
      ) : null}

      <form
        onSubmit={handleSave}
        className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]"
      >
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Provider configuration
        </h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          Configure your workspace email provider for reminder and transactional integrations.
        </p>
        {!canEdit && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">
            Only owners can change SMTP settings.
          </p>
        )}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
          Provider
        </label>
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as EmailProviderMode)}
          disabled={!canEdit || isPending}
          className={`${SETTINGS_SELECT_CLASSES} ${disabledFieldClass}`}
        >
          <option value="resend">Resend (default)</option>
          <option value="smtp">Custom SMTP</option>
        </select>
      </div>

      {showSmtpFields && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
              SMTP host
            </label>
            <input
              value={smtpHost}
              onChange={(event) => setSmtpHost(event.target.value)}
              disabled={!canEdit || isPending}
              className={`${SETTINGS_INPUT_CLASSES} ${disabledFieldClass}`}
              placeholder="smtp.mailprovider.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
              SMTP port
            </label>
            <input
              value={smtpPort}
              onChange={(event) => setSmtpPort(event.target.value)}
              disabled={!canEdit || isPending}
              className={`${SETTINGS_INPUT_CLASSES} ${disabledFieldClass}`}
              placeholder="587"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
              Username
            </label>
            <input
              value={smtpUsername}
              onChange={(event) => setSmtpUsername(event.target.value)}
              disabled={!canEdit || isPending}
              className={`${SETTINGS_INPUT_CLASSES} ${disabledFieldClass}`}
              placeholder="SMTP username"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
              Password
            </label>
            <input
              type="password"
              value={smtpPassword}
              onChange={(event) => setSmtpPassword(event.target.value)}
              disabled={!canEdit || isPending}
              className={`${SETTINGS_INPUT_CLASSES} ${disabledFieldClass}`}
              placeholder={smtpPasswordPresent ? '•••••••• (leave blank to keep current)' : 'SMTP password'}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
              From name
            </label>
            <input
              value={fromName}
              onChange={(event) => setFromName(event.target.value)}
              disabled={!canEdit || isPending}
              className={`${SETTINGS_INPUT_CLASSES} ${disabledFieldClass}`}
              placeholder="Lateless"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
              From email
            </label>
            <input
              value={fromEmail}
              onChange={(event) => setFromEmail(event.target.value)}
              disabled={!canEdit || isPending}
              className={`${SETTINGS_INPUT_CLASSES} ${disabledFieldClass}`}
              placeholder="billing@yourdomain.com"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
              Reply-to (optional)
            </label>
            <input
              value={replyTo}
              onChange={(event) => setReplyTo(event.target.value)}
              disabled={!canEdit || isPending}
              className={`${SETTINGS_INPUT_CLASSES} ${disabledFieldClass}`}
              placeholder="support@yourdomain.com"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={smtpSecure}
              onChange={(event) => setSmtpSecure(event.target.checked)}
              disabled={!canEdit || isPending}
              className={SETTINGS_CHECKBOX_CLASSES}
            />
            Use TLS/SSL (`secure`)
          </label>
        </div>
      )}

      {message && (
        <p
          className={`text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
          aria-live="polite"
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canEdit || isPending}>
          {isPending ? 'Saving...' : 'Save settings'}
        </Button>
        {(data.userRole === 'owner' || data.userRole === 'admin') ? (
          <Button type="button" onClick={handleSendTestEmail} disabled={!canSendTestEmail}>
            {testStatus === 'sending' ? 'Sending...' : 'Send test email'}
          </Button>
        ) : null}
        {testMessage ? (
          <p className={`text-sm ${testStatus === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
            {testMessage}
          </p>
        ) : null}
      </div>
      </form>
    </div>
  );
}
