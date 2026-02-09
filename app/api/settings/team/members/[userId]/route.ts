import { NextResponse } from 'next/server';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
  removeWorkspaceMember,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';

export const runtime = 'nodejs';

type RouteProps = {
  params: Promise<{ userId?: string }>;
};

export async function DELETE(_: Request, props: RouteProps) {
  const params = await props.params;
  const userId = params.userId?.trim();

  if (!userId) {
    return NextResponse.json(
      { ok: false, message: 'Invalid user id.' },
      { status: 400 },
    );
  }

  try {
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner') {
      return NextResponse.json(
        { ok: false, message: 'Only workspace owners can remove members.' },
        { status: 403 },
      );
    }

    if (context.userId === userId) {
      return NextResponse.json(
        { ok: false, message: 'Owner cannot remove themselves.' },
        { status: 400 },
      );
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
    if (isTeamMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: TEAM_MIGRATION_REQUIRED_CODE,
          message:
            'Team requires DB migration 007_add_workspaces_and_team.sql. Run migrations and retry.',
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
