import { Metadata } from 'next';
import DocumentsSettingsPanel from './documents-settings-panel';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  fetchWorkspaceDocumentSettings,
  isDocumentsMigrationRequiredError,
} from '@/app/lib/documents';

export const metadata: Metadata = {
  title: 'Documents Settings',
};

const migrationMessage =
  'Documents requires DB migrations 007_add_workspaces_and_team.sql and 010_add_documents_settings.sql. Run migrations and retry.';

export default async function DocumentsSettingsPage() {
  let panelProps:
    | {
        initialSettings: Awaited<ReturnType<typeof fetchWorkspaceDocumentSettings>>;
        userRole: 'owner' | 'admin' | 'member';
        canEdit: boolean;
      }
    | null = null;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const settings = await fetchWorkspaceDocumentSettings(context.workspaceId);
    panelProps = {
      initialSettings: settings,
      userRole: context.userRole,
      canEdit: context.userRole === 'owner',
    };
  } catch (error) {
    if (isTeamMigrationRequiredError(error) || isDocumentsMigrationRequiredError(error)) {
      return <DocumentsSettingsPanel migrationWarning={migrationMessage} />;
    }
    throw error;
  }

  if (!panelProps) {
    throw new Error('Failed to load documents settings.');
  }

  return <DocumentsSettingsPanel {...panelProps} />;
}
