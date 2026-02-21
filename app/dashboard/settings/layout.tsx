import SettingsSectionsNav from '@/app/ui/dashboard/settings-sections-nav';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isReminderManualRunAdmin } from '@/app/lib/reminder-admin';
import { PageShell, SectionCard } from '@/app/ui/page-layout';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const diagnosticsEnabledFlag = diagnosticsEnabled();
  let canViewFunnel = false;
  let currentUserEmail: string | null = null;
  let currentUserRole: 'owner' | 'admin' | 'member' | null = null;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    currentUserEmail = context.userEmail;
    currentUserRole = context.userRole;
    const hasWorkspaceAccess =
      context.userRole === 'owner' || context.userRole === 'admin';
    canViewFunnel =
      hasWorkspaceAccess && isReminderManualRunAdmin(context.userEmail);
  } catch {
    canViewFunnel = false;
    currentUserEmail = null;
    currentUserRole = null;
  }

  return (
    <PageShell
      title="Settings"
      subtitle="Workspace-level configuration for usage, billing, team, integrations, and documents."
      className="max-w-5xl"
    >
      <SectionCard className="p-4">
        <SettingsSectionsNav
          canViewFunnel={canViewFunnel}
          diagnosticsEnabled={diagnosticsEnabledFlag}
          currentUserEmail={currentUserEmail}
          currentUserRole={currentUserRole}
        />
      </SectionCard>
      {children}
    </PageShell>
  );
}
