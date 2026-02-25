import { NextResponse } from 'next/server';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  listReminderRuns,
  isReminderRunsMigrationRequiredError,
  REMINDER_RUNS_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/reminder-runs';

export const runtime = 'nodejs';

const migrationMessage =
  'Reminder runs require DB migrations 007_add_workspaces_and_team.sql and 016_add_reminder_runs.sql. Run migrations and retry.';

export async function GET() {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner' && context.userRole !== 'admin') {
      return NextResponse.json(
        {
          ok: false,
          message: 'Only owners and admins can view reminder runs.',
        },
        { status: 403 },
      );
    }
    const runs = await listReminderRuns(context.workspaceId, 25);
    return NextResponse.json({
      ok: true,
      runs: runs.map((run) => ({
        run_id: run.id,
        ran_at: run.ranAt,
        source: run.triggeredBy,
        dry_run: run.dryRun,
        attempted: run.attemptedCount,
        sent: run.dryRun ? 0 : run.sentCount,
        skipped: run.skippedCount,
        errors: run.errorCount,
        error_items: run.errors ?? [],
        duration_ms: run.durationMs,
        skipped_breakdown: run.skippedBreakdown ?? {},
      })),
    });
  } catch (error) {
    if (isTeamMigrationRequiredError(error) || isReminderRunsMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: REMINDER_RUNS_MIGRATION_REQUIRED_CODE,
          message: migrationMessage,
        },
        { status: 503 },
      );
    }

    console.error('Load reminder runs failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to load reminder runs.' },
      { status: 500 },
    );
  }
}
