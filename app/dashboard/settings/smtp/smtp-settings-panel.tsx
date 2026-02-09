'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Button, secondaryButtonClasses } from '@/app/ui/button';
import type { EmailProviderMode, WorkspaceEmailSettings } from '@/app/lib/smtp-settings';

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

export default function SmtpSettingsPanel() {
  const [data, setData] = useState<ApiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [provider, setProvider] = useState<EmailProviderMode>('resend');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [smtpPasswordPresent, setSmtpPasswordPresent] = useState(false);

  const canEdit = data?.canEdit ?? false;

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

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setMigrationMessage(null);
      setMessage(null);

      const res = await fetch('/api/settings/smtp', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            code?: string;
            message?: string;
            canEdit?: boolean;
            userRole?: 'owner' | 'admin' | 'member';
            settings?: WorkspaceEmailSettings;
          }
        | null;

      if (!active) return;

      if (!res.ok || !payload?.ok || !payload.settings || !payload.userRole) {
        if (
          payload?.code === 'TEAM_MIGRATION_REQUIRED' ||
          payload?.code === 'SMTP_MIGRATION_REQUIRED'
        ) {
          setMigrationMessage(payload.message ?? 'Required migrations are missing.');
          setData(null);
          syncForm(defaultSettings);
        } else {
          setMessage({
            ok: false,
            text: payload?.message ?? 'Failed to load SMTP settings.',
          });
        }
        setLoading(false);
        return;
      }

      const nextData: ApiState = {
        canEdit: Boolean(payload.canEdit),
        userRole: payload.userRole,
        settings: payload.settings,
      };

      setData(nextData);
      syncForm(payload.settings);
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const showSmtpFields = provider === 'smtp';

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

      setMessage({ ok: true, text: 'SMTP settings saved.' });
      setSmtpPassword('');
      syncForm(body.settings);
    });
  }

  async function handleSendTest() {
    if (!canEdit) return;
    setMessage(null);

    startTransition(async () => {
      const res = await fetch('/api/settings/smtp/test', {
        method: 'POST',
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!res.ok || !body?.ok) {
        setMessage({
          ok: false,
          text: body?.message ?? 'Failed to send test email.',
        });
        return;
      }

      setMessage({
        ok: true,
        text: 'Test email sent to your account email address.',
      });
    });
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          SMTP Integrations
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Loading settings...</p>
      </div>
    );
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

  return (
    <form
      onSubmit={handleSave}
      className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          SMTP Integrations
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
          className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${disabledFieldClass}`}
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
              className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${disabledFieldClass}`}
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
              className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${disabledFieldClass}`}
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
              className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${disabledFieldClass}`}
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
              className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${disabledFieldClass}`}
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
              className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${disabledFieldClass}`}
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
              className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${disabledFieldClass}`}
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
              className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${disabledFieldClass}`}
              placeholder="support@yourdomain.com"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={smtpSecure}
              onChange={(event) => setSmtpSecure(event.target.checked)}
              disabled={!canEdit || isPending}
              className="h-4 w-4 rounded border-slate-400 text-slate-900 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
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
        <button
          type="button"
          onClick={handleSendTest}
          disabled={!canEdit || isPending}
          className={`${secondaryButtonClasses} ${!canEdit || isPending ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          Send test email
        </button>
      </div>
    </form>
  );
}
