import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  cancelWorkspaceInvite,
  createWorkspaceInvite,
  fetchPendingWorkspaceInvites,
  fetchWorkspaceMembers,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import {
  isWorkspaceContextError,
  requireWorkspaceRole,
} from '@/app/lib/workspace-context';
import { sendWorkspaceInviteEmail } from '@/app/lib/email';
import { normalizePlan, TEAM_SEAT_LIMIT_BY_PLAN } from '@/app/lib/config';
import { readCanonicalWorkspacePlanSource } from '@/app/lib/billing-sync';
import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

const inviteSchema = z
  .object({
    email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
    role: z.enum(['admin', 'member']),
  })
  .strict();

const cancelInviteSchema = z
  .object({
    inviteId: z.string().uuid(),
  })
  .strict();

function resolveBaseUrl(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : new URL(req.url).origin)
  );
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireWorkspaceRole(['owner', 'admin']);

    const rl = await enforceRateLimit(
      request,
      {
        bucket: 'team_invite',
        windowSec: 300,
        ipLimit: 10,
        userLimit: 5,
      },
      { userKey: context.userEmail },
    );
    if (rl) return rl;

    const parsedBody = await parseJsonBody(request, inviteSchema);
    if (!parsedBody.ok) return parsedBody.response;

    const [members, pendingInvites, planSource] = await Promise.all([
      fetchWorkspaceMembers(context.workspaceId),
      fetchPendingWorkspaceInvites(context.workspaceId),
      readCanonicalWorkspacePlanSource({
        workspaceId: context.workspaceId,
        userId: context.userId,
      }),
    ]);

    if (members.some((member) => member.email === parsedBody.data.email)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'ALREADY_MEMBER',
          message: `${parsedBody.data.email} is already a company member.`,
        },
        { status: 409 },
      );
    }

    if (pendingInvites.some((invite) => invite.email === parsedBody.data.email)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'ALREADY_MEMBER',
          message: `${parsedBody.data.email} already has a pending invite.`,
        },
        { status: 409 },
      );
    }

    const plan = normalizePlan(planSource.value);
    const seatLimit = TEAM_SEAT_LIMIT_BY_PLAN[plan];
    const seatsUsed = members.length + pendingInvites.length;
    if (Number.isFinite(seatLimit) && seatsUsed >= seatLimit) {
      return NextResponse.json(
        {
          ok: false,
          code: 'SEAT_LIMIT_REACHED',
          message: `Your ${plan} plan allows up to ${seatLimit} team seats. Upgrade to add more members.`,
          plan,
          limit: seatLimit,
          seatsUsed,
          upgradeHref: '/dashboard/settings/billing',
        },
        { status: 409 },
      );
    }

    const invite = await createWorkspaceInvite({
      workspaceId: context.workspaceId,
      invitedByUserId: context.userId,
      email: parsedBody.data.email,
      role: parsedBody.data.role,
    });

    const inviteUrl = `${resolveBaseUrl(request)}/invite/${invite.token}`;

    try {
      await sendWorkspaceInviteEmail({
        to: parsedBody.data.email,
        invitedByEmail: context.userEmail,
        workspaceName: context.workspaceName,
        inviteUrl,
        role: parsedBody.data.role,
      });
    } catch (error) {
      console.error('Team invite email failed:', error);
    }

    return NextResponse.json({
      ok: true,
      message: 'Invite created and email sent if mail provider is configured.',
    });
  } catch (error) {
    if (isWorkspaceContextError(error)) {
      return NextResponse.json(
        { ok: false, code: error.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTHORIZED', message: error.message },
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

    console.error('Create invite failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to create invite.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireWorkspaceRole(['owner', 'admin']);

    const parsed = cancelInviteSchema.safeParse({
      inviteId: request.nextUrl.searchParams.get('inviteId'),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Invalid invite id.' },
        { status: 400 },
      );
    }

    const canceled = await cancelWorkspaceInvite({
      workspaceId: context.workspaceId,
      inviteId: parsed.data.inviteId,
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
        { ok: false, code: error.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTHORIZED', message: error.message },
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
