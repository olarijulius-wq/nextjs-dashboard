import { NextResponse } from 'next/server';
import {
  acceptInviteForCurrentUser,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';

export const runtime = 'nodejs';

type RouteProps = {
  params: Promise<{ token?: string }>;
};

export async function POST(_: Request, props: RouteProps) {
  const params = await props.params;
  const token = params.token?.trim() ?? '';

  try {
    const result = await acceptInviteForCurrentUser(token);

    if (!result.ok) {
      const status =
        result.code === 'EMAIL_MISMATCH'
          ? 403
          : result.code === 'EXPIRED' || result.code === 'INVALID_TOKEN'
            ? 400
            : 409;
      return NextResponse.json(
        { ok: false, message: result.message, code: result.code },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Joined ${result.workspaceName} as ${result.role}.`,
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

    console.error('Accept invite failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to accept invite.' },
      { status: 500 },
    );
  }
}
