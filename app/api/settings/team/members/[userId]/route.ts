import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchWorkspaceMembers,
  isTeamMigrationRequiredError,
  removeWorkspaceMember,
  TEAM_MIGRATION_REQUIRED_CODE,
  updateWorkspaceMemberRole,
} from '@/app/lib/workspaces';
import {
  isWorkspaceContextError,
  requireWorkspaceRole,
} from '@/app/lib/workspace-context';
import {
  enforceRateLimit,
  parseJsonBody,
  parseRouteParams,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

type RouteProps = {
  params: Promise<{ userId?: string }>;
};

const teamMemberParamsSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict();

const updateRoleBodySchema = z
  .object({
    role: z.enum(['owner', 'admin', 'member']),
  })
  .strict();

function ownerCount(members: Array<{ role: 'owner' | 'admin' | 'member' }>) {
  return members.filter((member) => member.role === 'owner').length;
}

export async function DELETE(request: Request, props: RouteProps) {
  const rawParams = await props.params;
  const parsedParams = parseRouteParams(teamMemberParamsSchema, rawParams);
  if (!parsedParams.ok) return parsedParams.response;
  const userId = parsedParams.data.userId;

  try {
    const context = await requireWorkspaceRole(['owner', 'admin']);

    const rl = await enforceRateLimit(
      request,
      {
        bucket: 'team_member_remove',
        windowSec: 300,
        ipLimit: 20,
        userLimit: 10,
      },
      { userKey: context.userEmail },
    );
    if (rl) return rl;

    const members = await fetchWorkspaceMembers(context.workspaceId);
    const target = members.find((member) => member.userId === userId);

    if (!target) {
      return NextResponse.json(
        { ok: false, message: 'Member not found.' },
        { status: 404 },
      );
    }

    if (target.role === 'owner') {
      const owners = ownerCount(members);
      if (owners <= 1) {
        return NextResponse.json(
          {
            ok: false,
            code: 'LAST_OWNER_PROTECTED',
            message: 'Cannot remove the last owner from this company.',
          },
          { status: 409 },
        );
      }
    }

    const removed = await removeWorkspaceMember({
      workspaceId: context.workspaceId,
      targetUserId: userId,
    });

    if (!removed) {
      return NextResponse.json(
        { ok: false, message: 'Member not found or cannot be removed.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Member removed from workspace.',
    });
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

    console.error('Remove workspace member failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to remove member.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, props: RouteProps) {
  const rawParams = await props.params;
  const parsedParams = parseRouteParams(teamMemberParamsSchema, rawParams);
  if (!parsedParams.ok) return parsedParams.response;
  const userId = parsedParams.data.userId;

  const parsedBody = await parseJsonBody(request, updateRoleBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const role = parsedBody.data.role;

  try {
    const context = await requireWorkspaceRole(['owner', 'admin']);

    const rl = await enforceRateLimit(
      request,
      {
        bucket: 'team_member_role_update',
        windowSec: 300,
        ipLimit: 20,
        userLimit: 10,
      },
      { userKey: context.userEmail },
    );
    if (rl) return rl;

    const members = await fetchWorkspaceMembers(context.workspaceId);
    const target = members.find((member) => member.userId === userId);

    if (!target) {
      return NextResponse.json(
        { ok: false, message: 'Member not found.' },
        { status: 404 },
      );
    }

    if (target.role === 'owner' && role !== 'owner') {
      const owners = ownerCount(members);
      if (owners <= 1) {
        const isSelf = context.userId === userId;
        return NextResponse.json(
          {
            ok: false,
            code: 'LAST_OWNER_PROTECTED',
            message: isSelf
              ? 'You cannot demote yourself while you are the last owner.'
              : 'Cannot demote the last owner of this company.',
          },
          { status: 409 },
        );
      }
    }

    const updated = await updateWorkspaceMemberRole({
      workspaceId: context.workspaceId,
      targetUserId: userId,
      role,
    });

    if (!updated) {
      return NextResponse.json(
        { ok: false, message: 'Member not found or role unchanged.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Member role updated.',
    });
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

    console.error('Update workspace member role failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to update member role.' },
      { status: 500 },
    );
  }
}
