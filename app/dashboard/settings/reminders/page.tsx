import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  listReminderRunLogs,
  isReminderRunLogsMigrationRequiredError,
  type ReminderRunLogRecord,
} from '@/app/lib/reminder-run-logs';
import { isReminderManualRunAdmin } from '@/app/lib/reminder-admin';
import RemindersAdminPanel from './reminders-admin-panel';

export const metadata: Metadata = {
  title: 'Reminders Admin',
};

export default async function RemindersAdminPage() {
  let canView = false;
  let migrationWarning: string | null = null;
  let runs: ReminderRunLogRecord[] = [];

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const hasWorkspaceAccess =
      context.userRole === 'owner' || context.userRole === 'admin';
    canView = hasWorkspaceAccess && isReminderManualRunAdmin(context.userEmail);

    if (canView) {
      runs = await listReminderRunLogs(20);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/reminders');
    }

    if (isTeamMigrationRequiredError(error) || isReminderRunLogsMigrationRequiredError(error)) {
      migrationWarning =
        'Reminder admin logs unavailable. Run migration 027_add_reminder_runs_admin_log.sql.';
    } else {
      throw error;
    }
  }

  if (!canView && !migrationWarning) {
    return (
      <div className="rounded-2xl border border-rose-300 bg-rose-100 p-4 text-sm text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
        Manual reminder runs are restricted to admin users.
      </div>
    );
  }

  if (!canView) {
    return (
      <p className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
        {migrationWarning}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {migrationWarning ? (
        <p className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {migrationWarning}
        </p>
      ) : null}
      <RemindersAdminPanel runs={runs} />
    </div>
  );
}
