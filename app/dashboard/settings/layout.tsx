import SettingsSectionsNav from '@/app/ui/dashboard/settings-sections-nav';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isReminderManualRunAdmin } from '@/app/lib/reminder-admin';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let canViewFunnel = false;
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const hasWorkspaceAccess =
      context.userRole === 'owner' || context.userRole === 'admin';
    canViewFunnel =
      hasWorkspaceAccess && isReminderManualRunAdmin(context.userEmail);
  } catch {
    canViewFunnel = false;
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Settings
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Workspace-level configuration for usage, billing, team, integrations,
          and documents.
        </p>
        <SettingsSectionsNav canViewFunnel={canViewFunnel} />
      </div>
      {children}
    </div>
  );
}
