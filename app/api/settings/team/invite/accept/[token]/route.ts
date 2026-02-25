import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  acceptInviteForCurrentUser,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import {
  enforceRateLimit,
  parseRouteParams,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

type RouteProps = {
  params: Promise<{ token?: string }>;
};

const inviteTokenParamsSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
  })
  .strict();

export async function POST(request: Request, props: RouteProps) {
  const rawParams = await props.params;
  const parsedParams = parseRouteParams(inviteTokenParamsSchema, rawParams);
  if (!parsedParams.ok) return parsedParams.response;
  const token = parsedParams.data.token;

  try {
    const rl = await enforceRateLimit(
      request,
      {
        bucket: 'team_invite_accept',
        windowSec: 300,
        ipLimit: 20,
      },
      { failClosed: true },
    );
    if (rl) return rl;

    const result = await acceptInviteForCurrentUser(token);

    if (!result.ok) {
      const status =
        result.code === 'EMAIL_MISMATCH'
          ? 403
          : result.code === 'INVITE_NOT_FOUND'
            ? 404
            : result.code === 'INVITE_EXPIRED' || result.code === 'INVITE_CANCELED'
              ? 410
              : result.code === 'INVALID_TOKEN'
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
            'Team requires DB migrations 007_add_workspaces_and_team.sql and 013_add_active_workspace_and_company_profile_workspace_scope.sql. Run migrations and retry.',
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
