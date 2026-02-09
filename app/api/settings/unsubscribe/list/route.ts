import { NextResponse } from 'next/server';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  fetchUnsubscribedRecipients,
  isUnsubscribeMigrationRequiredError,
  UNSUBSCRIBE_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/unsubscribe';

export const runtime = 'nodejs';

const migrationMessage =
  'Unsubscribe requires DB migrations 007_add_workspaces_and_team.sql and 009_add_unsubscribe.sql. Run migrations and retry.';

export async function GET() {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner' && context.userRole !== 'admin') {
      return NextResponse.json(
        {
          ok: false,
          message: 'Only owners and admins can view unsubscribed recipients.',
        },
        { status: 403 },
      );
    }

    const recipients = await fetchUnsubscribedRecipients(context.workspaceId);
    return NextResponse.json({ ok: true, recipients });
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

    console.error('Load unsubscribe recipients failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to load unsubscribed recipients.' },
      { status: 500 },
    );
  }
}
