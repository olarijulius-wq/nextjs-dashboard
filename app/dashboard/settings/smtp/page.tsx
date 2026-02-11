import { Metadata } from 'next';
import SmtpSettingsPanel from './smtp-settings-panel';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  fetchWorkspaceEmailSettings,
  isSmtpMigrationRequiredError,
} from '@/app/lib/smtp-settings';

export const metadata: Metadata = {
  title: 'SMTP Settings',
};

const migrationMessage =
  'SMTP requires DB migration 008_add_workspace_email_settings.sql. Run migrations and retry.';

export default async function SmtpSettingsPage() {
  let panelProps:
    | {
        initialSettings: Awaited<ReturnType<typeof fetchWorkspaceEmailSettings>>;
        canEdit: boolean;
        userRole: 'owner' | 'admin' | 'member';
      }
    | null = null;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const settings = await fetchWorkspaceEmailSettings(context.workspaceId);
    panelProps = {
      initialSettings: settings,
      canEdit: context.userRole === 'owner',
      userRole: context.userRole,
    };
  } catch (error) {
    if (isTeamMigrationRequiredError(error) || isSmtpMigrationRequiredError(error)) {
      return <SmtpSettingsPanel migrationMessage={migrationMessage} />;
    }
    throw error;
  }

  if (!panelProps) {
    throw new Error('Failed to load SMTP settings.');
  }

  return <SmtpSettingsPanel {...panelProps} />;
}
