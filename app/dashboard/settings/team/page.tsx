import { Metadata } from 'next';
import TeamSettingsPanel from './team-settings-panel';
import {
  ensureWorkspaceContextForCurrentUser,
  fetchPendingWorkspaceInvites,
  fetchWorkspaceMembers,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';

export const metadata: Metadata = {
  title: 'Team Settings',
};

export default async function TeamSettingsPage() {
  let teamData:
    | {
        workspaceName: string;
        userRole: 'owner' | 'admin' | 'member';
        currentUserId: string;
        members: Awaited<ReturnType<typeof fetchWorkspaceMembers>>;
        invites: Awaited<ReturnType<typeof fetchPendingWorkspaceInvites>>;
      }
    | null = null;
  let migrationRequired = false;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const canViewInvites = context.userRole === 'owner';
    const [members, invites] = await Promise.all([
      fetchWorkspaceMembers(context.workspaceId),
      canViewInvites
        ? fetchPendingWorkspaceInvites(context.workspaceId)
        : Promise.resolve([]),
    ]);
    teamData = {
      workspaceName: context.workspaceName,
      userRole: context.userRole,
      currentUserId: context.userId,
      members,
      invites,
    };
  } catch (error) {
    if (isTeamMigrationRequiredError(error)) {
      migrationRequired = true;
    } else {
      throw error;
    }
  }

  if (migrationRequired) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-amber-500/40 dark:bg-amber-500/10 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          Team requires a database migration
        </h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-100">
          Run migration <code>007_add_workspaces_and_team.sql</code> and retry.
        </p>
      </div>
    );
  }

  if (!teamData) {
    throw new Error('Failed to load team settings.');
  }

  return (
    <TeamSettingsPanel
      workspaceName={teamData.workspaceName}
      userRole={teamData.userRole}
      currentUserId={teamData.currentUserId}
      members={teamData.members}
      invites={teamData.invites}
    />
  );
}
