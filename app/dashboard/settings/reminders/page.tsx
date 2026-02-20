import { Metadata } from 'next';
import postgres from 'postgres';
import { notFound, redirect } from 'next/navigation';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  getReminderRunLogsScopeMode,
  listReminderRunLogs,
  isReminderRunLogsMigrationRequiredError,
  type ReminderRunLogRecord,
} from '@/app/lib/reminder-run-logs';
import {
  countBadRows,
  countScopeRuns,
  getReminderRunsSchema,
  sampleBadRows,
} from '@/app/lib/reminder-runs-diagnostics';
import RemindersAdminPanel from './reminders-admin-panel';

export const metadata: Metadata = {
  title: 'Reminders Admin',
};

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export default async function RemindersAdminPage() {
  let migrationWarning: string | null = null;
  let runs: ReminderRunLogRecord[] = [];
  let activeWorkspaceId: string | null = null;
  let activeUserEmail: string | null = null;
  let scopeMode: 'workspace' | 'account' = 'workspace';
  let diagnostics:
    | {
        schema: {
          hasWorkspaceId: boolean;
          hasUserEmail: boolean;
          hasActorEmail: boolean;
          hasConfig: boolean;
          rawJsonType: string | null;
        };
        counts: {
          totalRuns: number;
          workspaceScopedRuns: number;
          cronRunsMissingWorkspaceId: number;
          rowsMissingUserEmail: number;
          totalBadRows: number;
        };
        samples: Array<{
          id: string;
          ranAt: string;
          triggeredBy: string;
          sent: number;
          workspaceId: string | null;
          userEmail: string | null;
          candidateWorkspaceIds: string[];
          updatedInvoiceIdsLength: number;
        }>;
      }
    | null = null;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const canView = context.userRole === 'owner' || context.userRole === 'admin';

    if (!canView) {
      notFound();
    }

    activeWorkspaceId = context.workspaceId;
    activeUserEmail = context.userEmail;
    scopeMode = await getReminderRunLogsScopeMode();
    runs = await listReminderRunLogs({
      limit: 20,
      workspaceId: context.workspaceId,
      userEmail: context.userEmail,
    });
    const schema = await getReminderRunsSchema(sql);
    const [badCounts, scopeCounts, samples] = await Promise.all([
      countBadRows(sql, schema),
      countScopeRuns(
        sql,
        { workspaceId: context.workspaceId, userEmail: context.userEmail },
        schema,
      ),
      sampleBadRows(sql, 5, schema),
    ]);
    diagnostics = {
      schema: {
        hasWorkspaceId: schema.hasWorkspaceId,
        hasUserEmail: schema.hasUserEmail,
        hasActorEmail: schema.hasActorEmail,
        hasConfig: schema.hasConfig,
        rawJsonType: schema.rawJsonType,
      },
      counts: {
        totalRuns: scopeCounts.totalRuns,
        workspaceScopedRuns: scopeCounts.workspaceScopedRuns,
        cronRunsMissingWorkspaceId: badCounts.cronRunsMissingWorkspaceId,
        rowsMissingUserEmail: badCounts.rowsMissingUserEmail,
        totalBadRows: badCounts.totalBadRows,
      },
      samples,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/reminders');
    }

    if (
      isTeamMigrationRequiredError(error) ||
      isReminderRunLogsMigrationRequiredError(error)
    ) {
      migrationWarning =
        'Reminder admin logs unavailable. Run migrations through 032_backfill_reminder_runs_scope.sql.';
    } else {
      throw error;
    }
  }

  return (
    <div className="space-y-4">
      {migrationWarning ? (
        <p className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {migrationWarning}
        </p>
      ) : null}
      <RemindersAdminPanel
        runs={runs}
        activeWorkspaceId={activeWorkspaceId}
        activeUserEmail={activeUserEmail}
        scopeMode={scopeMode}
        diagnostics={diagnostics}
      />
    </div>
  );
}
