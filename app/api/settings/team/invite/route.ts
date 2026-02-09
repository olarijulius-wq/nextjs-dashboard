import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createWorkspaceInvite,
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import { sendWorkspaceInviteEmail } from '@/app/lib/email';

export const runtime = 'nodejs';

const inviteSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  role: z.enum(['admin', 'member']),
});

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid request payload.' },
      { status: 400 },
    );
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Please provide a valid email and role.' },
      { status: 400 },
    );
  }

  try {
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner') {
      return NextResponse.json(
        { ok: false, message: 'Only workspace owners can invite members.' },
        { status: 403 },
      );
    }

    const invite = await createWorkspaceInvite({
      workspaceId: context.workspaceId,
      invitedByUserId: context.userId,
      email: parsed.data.email,
      role: parsed.data.role,
    });

    const inviteUrl = `${resolveBaseUrl(request)}/invite/${invite.token}`;

    try {
      await sendWorkspaceInviteEmail({
        to: parsed.data.email,
        invitedByEmail: context.userEmail,
        workspaceName: context.workspaceName,
        inviteUrl,
        role: parsed.data.role,
      });
    } catch (error) {
      console.error('Team invite email failed:', error);
    }

    return NextResponse.json({
      ok: true,
      message: 'Invite created and email sent if mail provider is configured.',
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

    console.error('Create invite failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to create invite.' },
      { status: 500 },
    );
  }
}
