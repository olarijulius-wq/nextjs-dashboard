import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  cancelWorkspaceInvite,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import {
  isWorkspaceContextError,
  requireWorkspaceRole,
} from '@/app/lib/workspace-context';
import { parseRouteParams } from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

type RouteProps = {
  params: Promise<{ id?: string }>;
};

const inviteParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export async function DELETE(_: Request, props: RouteProps) {
  const rawParams = await props.params;
  const parsedParams = parseRouteParams(inviteParamsSchema, rawParams);
  if (!parsedParams.ok) return parsedParams.response;

  try {
    const context = await requireWorkspaceRole(['owner', 'admin']);

    const canceled = await cancelWorkspaceInvite({
      workspaceId: context.workspaceId,
      inviteId: parsedParams.data.id,
    });

    if (!canceled) {
      return NextResponse.json(
        { ok: false, message: 'Invite not found or already canceled.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, message: 'Invite canceled.' });
  } catch (error) {
    if (isWorkspaceContextError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTHORIZED',
          message: error.message,
        },
        { status: error.status },
      );
    }

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

    console.error('Cancel invite failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to cancel invite.' },
      { status: 500 },
    );
  }
}
