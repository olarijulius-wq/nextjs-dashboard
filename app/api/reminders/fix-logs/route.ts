import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import postgres from 'postgres';
import { auth } from '@/auth';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import {
  assertLogVisibilityForWorkspace,
  backfillScope,
  countBadRows,
  countScopeRuns,
  getReminderRunsSchema,
} from '@/app/lib/reminder-runs-diagnostics';
import { enforceRateLimit } from '@/app/lib/security/api-guard';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await ensureWorkspaceContextForCurrentUser();
    if (!isInternalAdmin(context.userEmail)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    if (context.userRole !== 'owner' && context.userRole !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    const rl = await enforceRateLimit(
      req,
      {
        bucket: 'reminders_fix_logs',
        windowSec: 300,
        ipLimit: 10,
        userLimit: 3,
      },
      { userKey: context.userEmail },
    );
    if (rl) return rl;

    const schema = await getReminderRunsSchema(sql);
    const [beforeBad, beforeScope] = await Promise.all([
      countBadRows(sql, schema),
      countScopeRuns(
        sql,
        { workspaceId: context.workspaceId, userEmail: context.userEmail },
        schema,
      ),
    ]);

    const fixed = await backfillScope(sql);

    const [afterBad, afterScope, visibility] = await Promise.all([
      countBadRows(sql, schema),
      countScopeRuns(
        sql,
        { workspaceId: context.workspaceId, userEmail: context.userEmail },
        schema,
      ),
      assertLogVisibilityForWorkspace(sql, {
        workspaceId: context.workspaceId,
        userEmail: context.userEmail,
      }),
    ]);

    revalidatePath('/dashboard/settings/reminders');
    revalidatePath('/dashboard/(overview)');

    return NextResponse.json({
      ok: true,
      schema: {
        hasWorkspaceId: schema.hasWorkspaceId,
        hasUserEmail: schema.hasUserEmail,
        hasActorEmail: schema.hasActorEmail,
        hasConfig: schema.hasConfig,
        rawJsonType: schema.rawJsonType,
      },
      before: {
        totalRuns: beforeScope.totalRuns,
        workspaceScopedRuns: beforeScope.workspaceScopedRuns,
        ...beforeBad,
      },
      after: {
        totalRuns: afterScope.totalRuns,
        workspaceScopedRuns: afterScope.workspaceScopedRuns,
        ...afterBad,
      },
      fixed,
      warning: visibility.ok ? null : visibility.warning,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Fix reminder logs failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to fix reminder logs.' },
      { status: 500 },
    );
  }
}
