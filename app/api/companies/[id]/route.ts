import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isTeamMigrationRequiredError,
  renameWorkspaceForUser,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import { requireWorkspaceRole } from '@/app/lib/workspace-context';
import {
  enforceRateLimit,
  parseJsonBody,
  parseRouteParams,
  routeUuidParamsSchema,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

const renameCompanySchema = z
  .object({
    name: z.string().max(200),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireWorkspaceRole(['owner', 'admin']);

    const rl = await enforceRateLimit(
      request,
      {
        bucket: 'companies_rename',
        windowSec: 300,
        ipLimit: 30,
        userLimit: 12,
      },
      { userKey: context.userEmail },
    );
    if (rl) return rl;

    const parsedParams = parseRouteParams(routeUuidParamsSchema, await params);
    if (!parsedParams.ok) return parsedParams.response;

    const parsedBody = await parseJsonBody(request, renameCompanySchema);
    if (!parsedBody.ok) return parsedBody.response;

    const updated = await renameWorkspaceForUser({
      workspaceId: parsedParams.data.id,
      userId: context.userId,
      name: parsedBody.data.name,
    });

    return NextResponse.json({
      ok: true,
      id: updated.id,
      name: updated.name,
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

    if (error instanceof Error && error.message === 'invalid_company_name') {
      return NextResponse.json(
        {
          ok: false,
          code: 'INVALID_COMPANY_NAME',
          message: 'Company name must be between 1 and 80 characters.',
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === 'forbidden') {
      return NextResponse.json(
        { ok: false, message: 'You do not have access to this company.' },
        { status: 403 },
      );
    }

    console.error('Rename company failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to rename company.' },
      { status: 500 },
    );
  }
}
