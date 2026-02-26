'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, secondaryButtonClasses } from '@/app/ui/button';
import { SETTINGS_INPUT_CLASSES, SETTINGS_SELECT_CLASSES } from '@/app/ui/form-control';
import type { WorkspaceMembershipSummary, WorkspaceRole } from '@/app/lib/workspaces';

type CompanySwitcherProps = {
  currentCompanyId: string;
  currentCompanyName: string;
  companies: WorkspaceMembershipSummary[];
  userRole: WorkspaceRole;
  onItemSelect?: () => void;
};

function normalizeName(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export default function CompanySwitcher({
  currentCompanyId,
  currentCompanyName,
  companies,
  userRole,
  onItemSelect,
}: CompanySwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameName, setRenameName] = useState(currentCompanyName);
  const canManage = userRole === 'owner' || userRole === 'admin';

  function refreshWorkspaceViews() {
    router.refresh();
    router.prefetch('/dashboard');
    router.prefetch('/dashboard/invoices');
    router.prefetch('/dashboard/customers');
  }

  useEffect(() => {
    setRenameName(currentCompanyName);
  }, [currentCompanyName]);

  async function onSwitchCompany(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextCompanyId = event.target.value;
    if (!nextCompanyId || nextCompanyId === currentCompanyId) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      const response = await fetch(`/api/companies/${nextCompanyId}/switch`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setStatus({
          ok: false,
          message: payload?.message ?? 'Failed to switch company.',
        });
        return;
      }

      setStatus({ ok: true, message: payload.message ?? 'Active company updated.' });
      onItemSelect?.();
      refreshWorkspaceViews();
    });
  }

  async function onCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    startTransition(async () => {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizeName(createName) || 'Company' }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; name?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setStatus({ ok: false, message: payload?.message ?? 'Failed to create company.' });
        return;
      }

      setStatus({
        ok: true,
        message: payload.name ? `Created ${payload.name}.` : 'Company created.',
      });
      setCreateName('');
      setIsCreateOpen(false);
      onItemSelect?.();
      refreshWorkspaceViews();
    });
  }

  async function onRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    startTransition(async () => {
      const response = await fetch(`/api/companies/${currentCompanyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizeName(renameName) }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; name?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setStatus({ ok: false, message: payload?.message ?? 'Failed to rename company.' });
        return;
      }

      setStatus({
        ok: true,
        message: payload.name ? `Renamed to ${payload.name}.` : 'Company renamed.',
      });
      setIsRenameOpen(false);
      onItemSelect?.();
      refreshWorkspaceViews();
    });
  }

  return (
    <>
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-500">
        Company
      </p>
      <p className="px-3 pb-2 text-xs text-neutral-600 dark:text-neutral-400" title={currentCompanyName}>
        {currentCompanyName}
      </p>
      <div className="px-3 pb-2">
        <select
          value={currentCompanyId}
          onChange={onSwitchCompany}
          className={`${SETTINGS_SELECT_CLASSES} h-9 py-1 text-xs`}
          disabled={isPending}
          aria-label="Switch company"
        >
          {companies.map((company) => (
            <option key={company.workspaceId} value={company.workspaceId}>
              {company.workspaceName} ({company.role})
            </option>
          ))}
        </select>
      </div>

      {canManage ? (
        <div className="flex gap-2 px-3 pb-2">
          <button
            type="button"
            className={`${secondaryButtonClasses} h-8 px-3 py-1 text-xs`}
            onClick={() => setIsCreateOpen(true)}
            disabled={isPending}
          >
            Create company...
          </button>
          <button
            type="button"
            className={`${secondaryButtonClasses} h-8 px-3 py-1 text-xs`}
            onClick={() => setIsRenameOpen(true)}
            disabled={isPending}
          >
            Rename company...
          </button>
        </div>
      ) : null}

      {status ? (
        <p
          className={`px-3 pb-2 text-xs ${status.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}
          aria-live="polite"
        >
          {status.message}
        </p>
      ) : null}

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={onCreateSubmit}
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-black"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Create company
            </h2>
            <input
              autoFocus
              required
              maxLength={80}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Company name"
              className={`mt-4 ${SETTINGS_INPUT_CLASSES}`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButtonClasses}
                onClick={() => setIsCreateOpen(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creating...' : 'Create company'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {isRenameOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={onRenameSubmit}
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-black"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Rename company
            </h2>
            <input
              autoFocus
              required
              maxLength={80}
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              placeholder="Company name"
              className={`mt-4 ${SETTINGS_INPUT_CLASSES}`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButtonClasses}
                onClick={() => setIsRenameOpen(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save name'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
