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
import { getEffectiveMailConfig } from '@/app/lib/email';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

export const metadata: Metadata = {
  title: 'Email Setup',
};

const migrationMessage =
  'SMTP requires DB migrations 008_add_workspace_email_settings.sql and 021_add_workspace_smtp_password_encryption.sql. Run migrations and retry.';

export default async function SmtpSettingsPage() {
  let panelProps:
    | {
        initialSettings: Awaited<ReturnType<typeof fetchWorkspaceEmailSettings>>;
        mailConfig: ReturnType<typeof getEffectiveMailConfig>;
        canEdit: boolean;
        userRole: 'owner' | 'admin' | 'member';
        canViewInternalDebug: boolean;
      }
    | null = null;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const settings = await fetchWorkspaceEmailSettings(context.workspaceId);
    panelProps = {
      initialSettings: settings,
      mailConfig: getEffectiveMailConfig({
        workspaceSettings: {
          provider: settings.provider,
          fromName: settings.fromName,
          fromEmail: settings.fromEmail,
          replyTo: settings.replyTo,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpUsername: settings.smtpUsername,
          smtpPasswordPresent: settings.smtpPasswordPresent,
        },
      }),
      canEdit: context.userRole === 'owner',
      userRole: context.userRole,
      canViewInternalDebug: isInternalAdmin(context.userEmail),
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
