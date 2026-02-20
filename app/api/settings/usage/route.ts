import { NextResponse } from 'next/server';
import { fetchUserPlanAndUsage } from '@/app/lib/data';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  fetchUsageSummary,
  fetchUsageTimeseries,
  fetchUsageTopReasons,
  isUsageMigrationRequiredError,
  normalizeUsageInvoiceMetric,
  USAGE_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/usage';

export const runtime = 'nodejs';

function getCurrentMonthRange(now: Date) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return { monthStart, monthEnd };
}

export async function GET(request: Request) {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const plan = await fetchUserPlanAndUsage();
    const { monthStart, monthEnd } = getCurrentMonthRange(new Date());
    const metric = normalizeUsageInvoiceMetric(
      new URL(request.url).searchParams.get('metric'),
    );

    const [summary, timeseries, topSkipReasons] = await Promise.all([
      fetchUsageSummary(context.workspaceId, monthStart, monthEnd),
      fetchUsageTimeseries({
        workspaceId: context.workspaceId,
        userEmail: context.userEmail,
        days: 30,
        invoiceMetric: metric,
      }),
      fetchUsageTopReasons(context.workspaceId, monthStart, monthEnd),
    ]);

    return NextResponse.json({
      ok: true,
      workspaceId: context.workspaceId,
      userRole: context.userRole,
      plan: {
        plan: plan.plan,
        invoiceCount: plan.invoiceCount,
        maxPerMonth: plan.maxPerMonth,
        subscriptionStatus: plan.subscriptionStatus,
      },
      summary,
      timeseries,
      topSkipReasons,
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
    });
  } catch (error) {
    if (isTeamMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'TEAM_MIGRATION_REQUIRED',
          message:
            'Team requires DB migrations 007_add_workspaces_and_team.sql and 013_add_active_workspace_and_company_profile_workspace_scope.sql. Run migrations and retry.',
        },
        { status: 503 },
      );
    }

    if (isUsageMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: USAGE_MIGRATION_REQUIRED_CODE,
          message:
            'Usage analytics requires DB migration 017_add_usage_events.sql. Run migrations and retry.',
        },
        { status: 503 },
      );
    }

    console.error('Load usage analytics failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to load usage analytics.' },
      { status: 500 },
    );
  }
}
