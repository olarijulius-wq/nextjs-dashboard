import { NextRequest, NextResponse } from 'next/server';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  isUnsubscribeMigrationRequiredError,
  normalizeEmail,
  resubscribeRecipient,
  UNSUBSCRIBE_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/unsubscribe';

export const runtime = 'nodejs';

const migrationMessage =
  'Unsubscribe requires DB migrations 007_add_workspaces_and_team.sql and 009_add_unsubscribe.sql. Run migrations and retry.';

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

  const emailRaw = (body as { email?: unknown })?.email;
  if (typeof emailRaw !== 'string' || emailRaw.trim() === '') {
    return NextResponse.json(
      { ok: false, message: 'Email is required.' },
      { status: 400 },
    );
  }

  try {
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner' && context.userRole !== 'admin') {
      return NextResponse.json(
        { ok: false, message: 'Only owners and admins can resubscribe recipients.' },
        { status: 403 },
      );
    }

    const removed = await resubscribeRecipient(
      context.workspaceId,
      normalizeEmail(emailRaw),
    );

    return NextResponse.json({
      ok: true,
      removed,
    });
  } catch (error) {
    if (isTeamMigrationRequiredError(error) || isUnsubscribeMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: UNSUBSCRIBE_MIGRATION_REQUIRED_CODE,
          message: migrationMessage,
        },
        { status: 503 },
      );
    }

    console.error('Resubscribe failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to resubscribe recipient.' },
      { status: 500 },
    );
  }
}
