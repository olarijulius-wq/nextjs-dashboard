'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, secondaryButtonClasses } from '@/app/ui/button';
import type {
  InvitableWorkspaceRole,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from '@/app/lib/workspaces';

type TeamSettingsPanelProps = {
  workspaceName: string;
  userRole: WorkspaceRole;
  currentUserId: string;
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function roleBadgeClass(role: WorkspaceRole | InvitableWorkspaceRole) {
  if (role === 'owner') {
    return 'border border-violet-500/40 bg-violet-500/10 text-violet-200';
  }
  if (role === 'admin') {
    return 'border border-sky-500/40 bg-sky-500/10 text-sky-200';
  }
  return 'border border-slate-500/40 bg-slate-500/10 text-slate-200';
}

export default function TeamSettingsPanel({
  workspaceName,
  userRole,
  currentUserId,
  members,
  invites,
}: TeamSettingsPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableWorkspaceRole>('member');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const canManage = userRole === 'owner';

  async function onInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    startTransition(async () => {
      const response = await fetch('/api/settings/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setStatus({
          ok: false,
          message: payload?.message ?? 'Failed to create invite.',
        });
        return;
      }

      setStatus({ ok: true, message: payload.message ?? 'Invite sent.' });
      setEmail('');
      router.refresh();
    });
  }

  async function onRemoveMember(userId: string, memberEmail: string) {
    const confirmed = window.confirm(
      `Remove ${memberEmail} from ${workspaceName}?`,
    );
    if (!confirmed) return;

    setStatus(null);

    startTransition(async () => {
      const response = await fetch(`/api/settings/team/members/${userId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setStatus({
          ok: false,
          message: payload?.message ?? 'Failed to remove member.',
        });
        return;
      }

      setStatus({ ok: true, message: payload.message ?? 'Member removed.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Team
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Workspace: {workspaceName}
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Your role: <span className="font-medium text-slate-800 dark:text-slate-200">{userRole}</span>
        </p>
      </div>

      {canManage && (
        <form onSubmit={onInviteSubmit} className="space-y-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Invite member
          </h3>
          <div className="grid gap-3 md:grid-cols-[1fr_170px_auto]">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="member@company.com"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as InvitableWorkspaceRole)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Sending...' : 'Send invite'}
            </Button>
          </div>
        </form>
      )}

      {status && (
        <p
          className={`text-sm ${status.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}
          aria-live="polite"
        >
          {status.message}
        </p>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Members
        </h3>

        <div className="space-y-2">
          {members.map((member) => {
            const canRemove =
              canManage && member.userId !== currentUserId && member.role !== 'owner';

            return (
              <div
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {member.name?.trim() || member.email}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {member.email}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass(member.role)}`}
                  >
                    {member.role}
                  </span>

                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => onRemoveMember(member.userId, member.email)}
                      className={`${secondaryButtonClasses} h-8 rounded-lg px-3 py-1 text-xs`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Pending invites
        </h3>

        {invites.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No pending invites.
          </p>
        ) : (
          <div className="space-y-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {invite.email}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Expires {formatDate(invite.expiresAt)}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${roleBadgeClass(invite.role)}`}
                >
                  {invite.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
