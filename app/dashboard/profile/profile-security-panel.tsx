'use client';

import { FormEvent, useState } from 'react';
import { signOut } from 'next-auth/react';
import { primaryButtonClasses } from '@/app/ui/button';

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePending, setChangePending] = useState(false);
  const [changeMessage, setChangeMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChangePending(true);
    setChangeMessage(null);

    try {
      const response = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmNewPassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !payload?.ok) {
        setChangeMessage({
          ok: false,
          text: payload?.message ?? 'Could not change password.',
        });
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setChangeMessage({ ok: true, text: 'Password updated.' });
    } catch {
      setChangeMessage({ ok: false, text: 'Could not change password.' });
    } finally {
      setChangePending(false);
    }
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={handleChangePassword}>
      <div>
        <label
          className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300"
          htmlFor="currentPassword"
        >
          Current password
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900/20 focus:ring-2 focus:ring-neutral-900/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500/25 dark:focus:ring-neutral-500/25"
        />
      </div>

      <div>
        <label
          className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300"
          htmlFor="newPassword"
        >
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900/20 focus:ring-2 focus:ring-neutral-900/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500/25 dark:focus:ring-neutral-500/25"
        />
      </div>

      <div>
        <label
          className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300"
          htmlFor="confirmNewPassword"
        >
          Confirm new password
        </label>
        <input
          id="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmNewPassword}
          onChange={(event) => setConfirmNewPassword(event.target.value)}
          className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900/20 focus:ring-2 focus:ring-neutral-900/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500/25 dark:focus:ring-neutral-500/25"
        />
      </div>

      <button
        type="submit"
        disabled={changePending}
        className={primaryButtonClasses}
      >
        {changePending ? 'Updating...' : 'Change password'}
      </button>

      {changeMessage ? (
        <p
          className={`text-sm ${
            changeMessage.ok
              ? 'text-neutral-700 dark:text-neutral-300'
              : 'text-rose-700 dark:text-rose-300'
          }`}
          aria-live="polite"
        >
          {changeMessage.text}
        </p>
      ) : null}
    </form>
  );
}

export function DeleteAccountForm() {
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeletePending(true);
    setDeleteMessage(null);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmText: deleteConfirmText,
          currentPassword: deletePassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok || !payload?.ok) {
        setDeleteMessage({
          ok: false,
          text: payload?.message ?? 'Could not delete account.',
        });
        return;
      }

      await signOut({ callbackUrl: '/' });
    } catch {
      setDeleteMessage({ ok: false, text: 'Could not delete account.' });
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={handleDeleteAccount}>
        <div>
          <label
            className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300"
            htmlFor="deleteConfirmText"
          >
            Type DELETE to confirm
          </label>
          <input
            id="deleteConfirmText"
            type="text"
            required
            value={deleteConfirmText}
            onChange={(event) => setDeleteConfirmText(event.target.value)}
            className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900/20 focus:ring-2 focus:ring-neutral-900/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500/25 dark:focus:ring-neutral-500/25"
            placeholder="DELETE"
          />
        </div>

        <div>
          <label
            className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300"
            htmlFor="deleteCurrentPassword"
          >
            Current password
          </label>
          <input
            id="deleteCurrentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-900/20 focus:ring-2 focus:ring-neutral-900/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-500/25 dark:focus:ring-neutral-500/25"
          />
        </div>

        <button
          type="submit"
          disabled={deletePending}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-50 transition duration-200 ease-out hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white dark:bg-white dark:text-black dark:hover:bg-neutral-100 dark:focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deletePending ? 'Deleting...' : 'Delete account'}
        </button>

        {deleteMessage ? (
          <p className="text-sm text-rose-700 dark:text-rose-300" aria-live="polite">
            {deleteMessage.text}
          </p>
        ) : null}
      </form>
  );
}
