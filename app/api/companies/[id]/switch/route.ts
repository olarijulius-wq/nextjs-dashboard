import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  isTeamMigrationRequiredError,
  setActiveWorkspaceForCurrentUser,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import { requireWorkspaceContext } from '@/app/lib/workspace-context';
import {
  enforceRateLimit,
  parseRouteParams,
  routeUuidParamsSchema,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireWorkspaceContext();

    const rl = await enforceRateLimit(
      request,
      {
        bucket: 'companies_switch',
        windowSec: 300,
        ipLimit: 40,
        userLimit: 20,
      },
      { userKey: context.userEmail },
    );
    if (rl) return rl;

    const parsedParams = parseRouteParams(routeUuidParamsSchema, await params);
    if (!parsedParams.ok) return parsedParams.response;

    await setActiveWorkspaceForCurrentUser(parsedParams.data.id);
    revalidatePath('/dashboard', 'layout');

    return NextResponse.json({
      ok: true,
      message: 'Active company updated.',
    });
  } catch (error) {
    if (isTeamMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: TEAM_MIGRATION_REQUIRED_CODE,
          message:
            'Team requires DB migrations 007_add_workspaces_and_team.sql and 013_add_active_workspace_and_company_profile_workspace_scope.sql. Run migrations and retry.',
        },
        { status: 503 },
      );
    }

    if (error instanceof Error && error.message === 'forbidden') {
      return NextResponse.json(
        { ok: false, message: 'You are not a member of that company.' },
        { status: 403 },
      );
    }

    console.error('Switch company failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to switch company.' },
      { status: 500 },
    );
  }
}
