import SettingsSectionsNav from '@/app/ui/dashboard/settings-sections-nav';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { buildSettingsSections } from '@/app/lib/settings-sections';
import { PageShell, SectionCard } from '@/app/ui/page-layout';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await ensureWorkspaceContextForCurrentUser();
  const sections = buildSettingsSections({
    userEmail: context.userEmail,
    userRole: context.userRole,
    diagnosticsEnabled: diagnosticsEnabled(),
  });

  return (
    <PageShell
      title="Settings"
      subtitle="Workspace-level configuration for usage, billing, team, integrations, and documents."
      className="max-w-5xl"
    >
      <SectionCard className="p-4">
        <SettingsSectionsNav sections={sections} />
      </SectionCard>
      {children}
    </PageShell>
  );
}
