'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button, secondaryButtonClasses } from '@/app/ui/button';
import type {
  UnsubscribedRecipient,
  WorkspaceUnsubscribeSettings,
} from '@/app/lib/unsubscribe';

type UserRole = 'owner' | 'admin' | 'member';

type SettingsApiResponse = {
  ok: boolean;
  settings?: WorkspaceUnsubscribeSettings;
  userRole?: UserRole;
  canEditSettings?: boolean;
  canManageRecipients?: boolean;
  code?: string;
  message?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function UnsubscribeSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [migrationWarning, setMigrationWarning] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('member');
  const [canEditSettings, setCanEditSettings] = useState(false);
  const [canManageRecipients, setCanManageRecipients] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [pageText, setPageText] = useState('');
  const [recipients, setRecipients] = useState<UnsubscribedRecipient[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadRecipients() {
    if (!canManageRecipients) {
      setRecipients([]);
      return;
    }

    const listResponse = await fetch('/api/settings/unsubscribe/list', {
      cache: 'no-store',
    });
    const listPayload = (await listResponse.json().catch(() => null)) as
      | { ok?: boolean; recipients?: UnsubscribedRecipient[]; message?: string }
      | null;

    if (listResponse.ok && listPayload?.ok && listPayload.recipients) {
      setRecipients(listPayload.recipients);
      return;
    }

    setMessage({
      ok: false,
      text: listPayload?.message ?? 'Failed to load unsubscribed recipients.',
    });
  }

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setMessage(null);
      setMigrationWarning(null);

      const response = await fetch('/api/settings/unsubscribe', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as
        | SettingsApiResponse
        | null;

      if (!active) return;

      if (!response.ok || !payload?.ok || !payload.settings || !payload.userRole) {
        if (payload?.code === 'UNSUBSCRIBE_MIGRATION_REQUIRED') {
          setMigrationWarning(
            payload.message ??
              'Run migration 009_add_unsubscribe.sql and retry.',
          );
        } else {
          setMessage({
            ok: false,
            text: payload?.message ?? 'Failed to load unsubscribe settings.',
          });
        }
        setLoading(false);
        return;
      }

      setEnabled(payload.settings.enabled);
      setPageText(payload.settings.pageText);
      setUserRole(payload.userRole);
      setCanEditSettings(Boolean(payload.canEditSettings));
      const canManage = Boolean(payload.canManageRecipients);
      setCanManageRecipients(canManage);
      setLoading(false);

      if (canManage) {
        const listResponse = await fetch('/api/settings/unsubscribe/list', {
          cache: 'no-store',
        });
        const listPayload = (await listResponse.json().catch(() => null)) as
          | { ok?: boolean; recipients?: UnsubscribedRecipient[]; message?: string }
          | null;

        if (!active) return;

        if (listResponse.ok && listPayload?.ok && listPayload.recipients) {
          setRecipients(listPayload.recipients);
        } else {
          setMessage({
            ok: false,
            text: listPayload?.message ?? 'Failed to load unsubscribed recipients.',
          });
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditSettings) return;

    setMessage(null);
    startTransition(async () => {
      const response = await fetch('/api/settings/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, pageText }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; settings?: WorkspaceUnsubscribeSettings; message?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.settings) {
        setMessage({
          ok: false,
          text: payload?.message ?? 'Failed to save unsubscribe settings.',
        });
        return;
      }

      setEnabled(payload.settings.enabled);
      setPageText(payload.settings.pageText);
      setMessage({ ok: true, text: 'Unsubscribe settings saved.' });
    });
  }

  function onResubscribe(email: string) {
    if (!canManageRecipients) return;

    setMessage(null);
    startTransition(async () => {
      const response = await fetch('/api/settings/unsubscribe/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage({
          ok: false,
          text: payload?.message ?? 'Failed to resubscribe recipient.',
        });
        return;
      }

      setMessage({ ok: true, text: `${email} has been resubscribed.` });
      await loadRecipients();
    });
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Unsubscribe
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Loading settings...</p>
      </div>
    );
  }

  if (migrationWarning) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-amber-500/40 dark:bg-amber-500/10 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          Unsubscribe requires database migration
        </h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-100">{migrationWarning}</p>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-100">
          Required file: <code>009_add_unsubscribe.sql</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
      <form onSubmit={onSave} className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Unsubscribe
          </h2>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            Configure unsubscribe behavior and reminder preferences.
          </p>
          {!canEditSettings && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">
              Only owners can change unsubscribe settings.
            </p>
          )}
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={!canEditSettings || isPending}
            className="h-4 w-4 rounded border-slate-400 text-slate-900 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          Include unsubscribe link in reminders
        </label>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">
            Unsubscribe page message
          </label>
          <textarea
            value={pageText}
            onChange={(event) => setPageText(event.target.value)}
            rows={4}
            disabled={!canEditSettings || isPending}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="You can add a short message shown on the unsubscribe confirmation page."
          />
        </div>

        <Button type="submit" disabled={!canEditSettings || isPending}>
          {isPending ? 'Saving...' : 'Save settings'}
        </Button>
      </form>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Unsubscribed recipients
        </h3>

        {!canManageRecipients ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Only owners and admins can view unsubscribed recipients.
          </p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No unsubscribed recipients.
          </p>
        ) : (
          <div className="space-y-2">
            {recipients.map((recipient) => (
              <div
                key={`${recipient.email}-${recipient.unsubscribedAt}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {recipient.email}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Unsubscribed: {formatDate(recipient.unsubscribedAt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onResubscribe(recipient.email)}
                  disabled={isPending}
                  className={`${secondaryButtonClasses} ${isPending ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  Resubscribe
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {message && (
        <p
          className={`text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
          aria-live="polite"
        >
          {message.text}
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">Current role: {userRole}</p>
    </div>
  );
}
