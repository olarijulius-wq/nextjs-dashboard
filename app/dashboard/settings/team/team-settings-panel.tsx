'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Button, secondaryButtonClasses } from '@/app/ui/button';
import type {
  InvitableWorkspaceRole,
  WorkspaceMembershipSummary,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from '@/app/lib/workspaces';
import { SETTINGS_INPUT_CLASSES, SETTINGS_SELECT_CLASSES } from '@/app/ui/form-control';

type TeamSettingsPanelProps = {
  workspaceName: string;
  userRole: WorkspaceRole;
  currentUserId: string;
  activeWorkspaceId: string;
  workspaces: WorkspaceMembershipSummary[];
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
};

type TeamApiPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  upgradeHref?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function roleBadgeClass(role: WorkspaceRole | InvitableWorkspaceRole) {
  if (role === 'owner') {
    return 'border border-neutral-400 bg-neutral-200 text-neutral-900 dark:border-neutral-500/60 dark:bg-neutral-700/30 dark:text-neutral-100';
  }
  if (role === 'admin') {
    return 'border border-neutral-300 bg-neutral-100 text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-200';
  }
  return 'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200';
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function resolveMemberDisplayName(name: string | null | undefined, email: string) {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return { primary: trimmedName, showEmailLine: true };
  }

  const trimmedEmail = email.trim();
  const [localPart] = trimmedEmail.split('@');
  const fallback = (localPart?.trim() || trimmedEmail || 'User').trim();
  return { primary: fallback, showEmailLine: false };
}

export default function TeamSettingsPanel({
  workspaceName,
  userRole,
  currentUserId,
  activeWorkspaceId,
  workspaces,
  members,
  invites,
}: TeamSettingsPanelProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenuTimeoutRef = useRef<number | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableWorkspaceRole>('member');
  const [status, setStatus] = useState<{
    ok: boolean;
    message: string;
    code?: string;
    upgradeHref?: string;
  } | null>(null);
  const [pendingInvites, setPendingInvites] = useState(invites);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameName, setRenameName] = useState(workspaceName);
  const [openActionsUserId, setOpenActionsUserId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    open: boolean;
  }>({ top: 0, left: 0, open: false });
  const [isPending, startTransition] = useTransition();
  const canManage = userRole === 'owner' || userRole === 'admin';
  const ownerCount = members.filter((member) => member.role === 'owner').length;

  function refreshWorkspaceViews() {
    router.refresh();
    router.prefetch('/dashboard');
    router.prefetch('/dashboard/invoices');
    router.prefetch('/dashboard/customers');
  }

  useEffect(() => {
    setPendingInvites(invites);
  }, [invites]);

  useEffect(() => {
    setRenameName(workspaceName);
  }, [workspaceName]);

  useEffect(() => {
    return () => {
      if (closeMenuTimeoutRef.current) {
        window.clearTimeout(closeMenuTimeoutRef.current);
      }
    };
  }, []);

  const clearCloseMenuTimeout = useCallback(() => {
    if (closeMenuTimeoutRef.current) {
      window.clearTimeout(closeMenuTimeoutRef.current);
      closeMenuTimeoutRef.current = null;
    }
  }, []);

  const closeActionsMenu = useCallback(() => {
    setMenuPosition((current) => ({ ...current, open: false }));
    clearCloseMenuTimeout();
    closeMenuTimeoutRef.current = window.setTimeout(() => {
      setOpenActionsUserId(null);
      closeMenuTimeoutRef.current = null;
    }, 140);
  }, [clearCloseMenuTimeout]);

  function toggleActionsMenuForUser(userId: string) {
    clearCloseMenuTimeout();
    if (openActionsUserId === userId && menuPosition.open) {
      closeActionsMenu();
      return;
    }
    setOpenActionsUserId(userId);
  }

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const targetNode = event.target as Node;
      if (menuRef.current?.contains(targetNode)) return;
      if (
        openActionsUserId &&
        triggerRefs.current.get(openActionsUserId)?.contains(targetNode)
      ) {
        return;
      }
      closeActionsMenu();
    }

    if (openActionsUserId) {
      document.addEventListener('mousedown', handleDocumentClick);
      return () => document.removeEventListener('mousedown', handleDocumentClick);
    }

    return undefined;
  }, [openActionsUserId, menuPosition.open, closeActionsMenu]);

  useEffect(() => {
    function updateMenuPosition() {
      if (!openActionsUserId) return;
      const trigger = triggerRefs.current.get(openActionsUserId);
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const width = 190;
      const nextLeft = Math.min(
        rect.left + 8,
        window.innerWidth - width - 12,
      );
      setMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(12, nextLeft),
        open: true,
      });
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeActionsMenu();
      }
    }

    if (!openActionsUserId) {
      setMenuPosition((current) => ({ ...current, open: false }));
      return undefined;
    }

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openActionsUserId, closeActionsMenu]);

  function getMemberActionState(member: WorkspaceMember) {
    const isCurrentUser = member.userId === currentUserId;
    const isLastOwner = member.role === 'owner' && ownerCount <= 1;
    const canChangeRole = canManage && !isLastOwner;
    const canRemove = canManage && !isLastOwner;
    const canChangeToAdmin = canChangeRole && member.role !== 'admin';
    const canChangeToMember = canChangeRole && member.role !== 'member';

    return {
      canChangeToAdmin,
      canChangeToMember,
      canRemove,
      hasActions: canChangeToAdmin || canChangeToMember || canRemove,
      isCurrentUser,
      isLastOwner,
    };
  }

  function registerTriggerRef(userId: string, element: HTMLButtonElement | null) {
    if (!element) {
      triggerRefs.current.delete(userId);
      return;
    }
    triggerRefs.current.set(userId, element);
  }

  function setError(payload: TeamApiPayload | null, fallback: string) {
    setStatus({
      ok: false,
      code: payload?.code,
      message: payload?.message ?? fallback,
      upgradeHref: payload?.upgradeHref,
    });
  }

  async function onInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    startTransition(async () => {
      const response = await fetch('/api/settings/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });

      const payload = (await response.json().catch(() => null)) as TeamApiPayload | null;

      if (!response.ok || !payload?.ok) {
        setError(payload, 'Failed to create invite.');
        return;
      }

      setStatus({ ok: true, message: payload.message ?? 'Invite sent.' });
      setEmail('');
      refreshWorkspaceViews();
    });
  }

  async function onRemoveMember(userId: string, memberEmail: string) {
    const confirmed = window.confirm(`Remove ${memberEmail} from ${workspaceName}?`);
    if (!confirmed) return;

    setStatus(null);

    startTransition(async () => {
      const response = await fetch(`/api/settings/team/members/${userId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as TeamApiPayload | null;

      if (!response.ok || !payload?.ok) {
        setError(payload, 'Failed to remove member.');
        return;
      }

      setStatus({ ok: true, message: payload.message ?? 'Member removed.' });
      closeActionsMenu();
      refreshWorkspaceViews();
    });
  }

  async function onChangeMemberRole(userId: string, nextRole: WorkspaceRole) {
    setStatus(null);

    startTransition(async () => {
      const response = await fetch(`/api/settings/team/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = (await response.json().catch(() => null)) as TeamApiPayload | null;

      if (!response.ok || !payload?.ok) {
        setError(payload, 'Failed to update role.');
        return;
      }

      setStatus({ ok: true, message: payload.message ?? 'Member role updated.' });
      closeActionsMenu();
      refreshWorkspaceViews();
    });
  }

  async function onSwitchWorkspace(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextWorkspaceId = event.target.value;
    if (!nextWorkspaceId || nextWorkspaceId === activeWorkspaceId) {
      return;
    }
    setStatus(null);

    startTransition(async () => {
      const response = await fetch(`/api/companies/${nextWorkspaceId}/switch`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as TeamApiPayload | null;

      if (!response.ok || !payload?.ok) {
        setError(payload, 'Failed to switch team.');
        return;
      }

      setStatus({
        ok: true,
        message: payload.message ?? 'Active team updated.',
      });
      refreshWorkspaceViews();
    });
  }

  async function onCreateCompany() {
    if (!canManage || isPending) return;
    const nameInput = window.prompt('Create company name');
    if (nameInput === null) return;
    const name = normalizeName(nameInput);
    if (!name) {
      setStatus({ ok: false, message: 'Company name is required.' });
      return;
    }

    setStatus(null);
    startTransition(async () => {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json().catch(() => null)) as
        | TeamApiPayload
        | { ok?: boolean; message?: string; name?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setError(payload as TeamApiPayload, 'Failed to create company.');
        return;
      }

      setStatus({
        ok: true,
        message:
          'name' in payload && payload.name ? `Created ${payload.name}.` : 'Company created.',
      });
      refreshWorkspaceViews();
    });
  }

  async function onRenameCompanySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || isPending) return;
    const name = normalizeName(renameName);
    if (!name) {
      setStatus({ ok: false, message: 'Company name is required.' });
      return;
    }

    setStatus(null);
    startTransition(async () => {
      const response = await fetch(`/api/companies/${activeWorkspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json().catch(() => null)) as
        | TeamApiPayload
        | { ok?: boolean; message?: string; name?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setError(payload as TeamApiPayload, 'Failed to rename company.');
        return;
      }

      setStatus({
        ok: true,
        message:
          'name' in payload && payload.name ? `Renamed to ${payload.name}.` : 'Company renamed.',
      });
      setIsRenameModalOpen(false);
      refreshWorkspaceViews();
    });
  }

  async function onCancelInvite(inviteId: string, inviteEmail: string) {
    const confirmed = window.confirm(`Cancel invite for ${inviteEmail}?`);
    if (!confirmed) return;

    setStatus(null);

    startTransition(async () => {
      const response = await fetch(`/api/settings/team/invite/${inviteId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as TeamApiPayload | null;

      if (!response.ok || !payload?.ok) {
        setError(payload, 'Failed to cancel invite.');
        return;
      }

      setPendingInvites((currentInvites) =>
        currentInvites.filter((invite) => invite.id !== inviteId),
      );
      setStatus({ ok: true, message: payload.message ?? 'Invite canceled.' });
      refreshWorkspaceViews();
    });
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Users &amp; Roles</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {workspaceName} · {members.length} member{members.length === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your role: <span className="font-medium text-slate-800 dark:text-slate-200">{userRole}</span>
          </p>
        </div>

        <label className="block text-sm text-slate-700 dark:text-slate-300">
          Active team
          <select
            value={activeWorkspaceId}
            onChange={onSwitchWorkspace}
            className={`mt-2 ${SETTINGS_SELECT_CLASSES}`}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.workspaceId} value={workspace.workspaceId}>
                {workspace.workspaceName} ({workspace.role})
              </option>
            ))}
          </select>
        </label>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreateCompany}
              className={`${secondaryButtonClasses} h-8 rounded-lg px-3 py-1 text-xs`}
              disabled={isPending}
            >
              Create company
            </button>
            <button
              type="button"
              onClick={() => setIsRenameModalOpen(true)}
              className={`${secondaryButtonClasses} h-8 rounded-lg px-3 py-1 text-xs`}
              disabled={isPending}
            >
              Rename company
            </button>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-neutral-200 p-3 text-xs text-slate-600 dark:border-neutral-800 dark:text-slate-300">
        <p>
          <span className="font-semibold text-slate-800 dark:text-slate-200">Owner:</span> full control, including billing, deleting company, and managing roles.
        </p>
        <p className="mt-1">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Admin:</span> can invite/remove members and change member roles.
        </p>
        <p className="mt-1">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Member:</span> read-only access.
        </p>
      </div>

      {canManage ? (
        <form onSubmit={onInviteSubmit} className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Invite member</h3>
          <div className="grid gap-3 md:grid-cols-[1fr_170px_auto]">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="member@company.com"
              className={SETTINGS_INPUT_CLASSES}
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as InvitableWorkspaceRole)}
              className={SETTINGS_SELECT_CLASSES}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Sending...' : 'Send invite'}
            </Button>
          </div>
        </form>
      ) : null}

      {status ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            status.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200'
          }`}
          aria-live="polite"
        >
          <p>{status.message}</p>
          {!status.ok &&
          (status.code === 'SEAT_LIMIT_REACHED' ||
            status.code === 'COMPANY_LIMIT_REACHED') ? (
            <div className="mt-2">
              <Link
                href={status.upgradeHref ?? '/dashboard/settings/billing'}
                className={`${secondaryButtonClasses} inline-flex h-8 items-center rounded-lg px-3 py-1 text-xs`}
              >
                Upgrade plan
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Members</h3>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
            <thead className="bg-neutral-50 dark:bg-neutral-900/40">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Name / Email</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Role</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Joined</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {members.map((member) => {
                const actionState = getMemberActionState(member);
                const displayName = resolveMemberDisplayName(member.name, member.email);
                const hideForCurrentLastOwner =
                  actionState.isCurrentUser && actionState.isLastOwner;
                const showEditTrigger =
                  actionState.hasActions && !hideForCurrentLastOwner;

                return (
                  <tr key={member.userId}>
                    <td className="px-3 py-2 align-middle">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {displayName.primary}
                      </p>
                      {displayName.showEmailLine ? (
                        <p className="text-xs text-slate-600 dark:text-slate-400">{member.email}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass(member.role)}`}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle text-xs text-slate-600 dark:text-slate-400">
                      {formatDate(member.createdAt)}
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      {showEditTrigger ? (
                        <div className="inline-block text-left">
                          <button
                            type="button"
                            id={`member-edit-trigger-${member.userId}`}
                            aria-haspopup="menu"
                            aria-expanded={openActionsUserId === member.userId}
                            aria-controls={
                              openActionsUserId === member.userId
                                ? `member-edit-menu-${member.userId}`
                                : undefined
                            }
                            onClick={() => toggleActionsMenuForUser(member.userId)}
                            ref={(element) => registerTriggerRef(member.userId, element)}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-500"
                            disabled={isPending}
                            aria-label={`Edit ${member.email}`}
                          >
                            Edit
                          </button>
                        </div>
                      ) : hideForCurrentLastOwner ? null : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Read only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pending invites</h3>

        {pendingInvites.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">No pending invites.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
              <thead className="bg-neutral-50 dark:bg-neutral-900/40">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Email</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Role</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Created</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Status</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {pendingInvites.map((invite) => (
                  <tr key={invite.id}>
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{invite.email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass(invite.role)}`}
                      >
                        {invite.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                      {formatDate(invite.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">Pending</td>
                    <td className="px-3 py-2 text-right">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => onCancelInvite(invite.id, invite.email)}
                          className={`${secondaryButtonClasses} h-8 rounded-lg px-3 py-1 text-xs`}
                          disabled={isPending}
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Read only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openActionsUserId
        ? (() => {
            const member = members.find((candidate) => candidate.userId === openActionsUserId);
            if (!member) return null;
            const actionState = getMemberActionState(member);
            if (!actionState.hasActions) return null;

            return createPortal(
              <div
                id={`member-edit-menu-${member.userId}`}
                ref={menuRef}
                role="menu"
                aria-labelledby={`member-edit-trigger-${member.userId}`}
                className={`fixed z-[150] w-[190px] rounded-lg border border-neutral-200 bg-white p-1.5 shadow-[0_16px_35px_rgba(15,23,42,0.14)] transition-all duration-150 dark:border-neutral-700 dark:bg-neutral-950 ${
                  menuPosition.open
                    ? 'translate-y-0 scale-100 opacity-100'
                    : '-translate-y-1 scale-95 opacity-0'
                }`}
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                }}
              >
                {(actionState.canChangeToAdmin || actionState.canChangeToMember) ? (
                  <div className="pb-1">
                    <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Change role
                    </p>
                    <div className="space-y-0.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onChangeMemberRole(member.userId, 'admin')}
                        disabled={isPending || !actionState.canChangeToAdmin}
                        className="block w-full rounded-md px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-45 dark:text-slate-200 dark:hover:bg-neutral-800"
                      >
                        Admin
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onChangeMemberRole(member.userId, 'member')}
                        disabled={isPending || !actionState.canChangeToMember}
                        className="block w-full rounded-md px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-45 dark:text-slate-200 dark:hover:bg-neutral-800"
                      >
                        Member
                      </button>
                    </div>
                  </div>
                ) : null}
                {actionState.canRemove ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => onRemoveMember(member.userId, member.email)}
                    disabled={isPending}
                    className="mt-0.5 block w-full rounded-md px-2.5 py-2 text-left text-xs text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    Remove from company
                  </button>
                ) : null}
              </div>,
              document.body,
            );
          })()
        : null}

      {isRenameModalOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={onRenameCompanySubmit}
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-black"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Rename company</h2>
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
                onClick={() => setIsRenameModalOpen(false)}
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
    </div>
  );
}
