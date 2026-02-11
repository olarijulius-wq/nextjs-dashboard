import { Metadata } from 'next';
import UnsubscribeSettingsPanel from './unsubscribe-settings-panel';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  fetchUnsubscribeSettings,
  fetchUnsubscribedRecipients,
  isUnsubscribeMigrationRequiredError,
} from '@/app/lib/unsubscribe';

export const metadata: Metadata = {
  title: 'Unsubscribe Settings',
};

const migrationMessage =
  'Unsubscribe requires DB migrations 007_add_workspaces_and_team.sql and 009_add_unsubscribe.sql. Run migrations and retry.';

export default async function UnsubscribeSettingsPage() {
  let panelProps:
    | {
        initialSettings: Awaited<ReturnType<typeof fetchUnsubscribeSettings>>;
        initialRecipients: Awaited<ReturnType<typeof fetchUnsubscribedRecipients>>;
        userRole: 'owner' | 'admin' | 'member';
        canEditSettings: boolean;
        canManageRecipients: boolean;
      }
    | null = null;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const canManageRecipients =
      context.userRole === 'owner' || context.userRole === 'admin';

    const [settings, recipients] = await Promise.all([
      fetchUnsubscribeSettings(context.workspaceId),
      canManageRecipients
        ? fetchUnsubscribedRecipients(context.workspaceId)
        : Promise.resolve([]),
    ]);

    panelProps = {
      initialSettings: settings,
      initialRecipients: recipients,
      userRole: context.userRole,
      canEditSettings: context.userRole === 'owner',
      canManageRecipients,
    };
  } catch (error) {
    if (isTeamMigrationRequiredError(error) || isUnsubscribeMigrationRequiredError(error)) {
      return <UnsubscribeSettingsPanel migrationWarning={migrationMessage} />;
    }
    throw error;
  }

  if (!panelProps) {
    throw new Error('Failed to load unsubscribe settings.');
  }

  return <UnsubscribeSettingsPanel {...panelProps} />;
}
