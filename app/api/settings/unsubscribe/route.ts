import { NextRequest, NextResponse } from 'next/server';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  fetchUnsubscribeSettings,
  isUnsubscribeMigrationRequiredError,
  UNSUBSCRIBE_MIGRATION_REQUIRED_CODE,
  upsertUnsubscribeSettings,
} from '@/app/lib/unsubscribe';

export const runtime = 'nodejs';

const migrationMessage =
  'Unsubscribe requires DB migrations 007_add_workspaces_and_team.sql and 009_add_unsubscribe.sql. Run migrations and retry.';

export async function GET() {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const settings = await fetchUnsubscribeSettings(context.workspaceId);

    return NextResponse.json({
      ok: true,
      settings,
      userRole: context.userRole,
      canEditSettings: context.userRole === 'owner',
      canManageRecipients:
        context.userRole === 'owner' || context.userRole === 'admin',
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

    console.error('Load unsubscribe settings failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to load unsubscribe settings.' },
      { status: 500 },
    );
  }
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

  try {
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner') {
      return NextResponse.json(
        { ok: false, message: 'Only owners can change unsubscribe settings.' },
        { status: 403 },
      );
    }

    const enabled = Boolean((body as { enabled?: unknown })?.enabled);
    const pageTextRaw = (body as { pageText?: unknown })?.pageText;
    const pageText = typeof pageTextRaw === 'string' ? pageTextRaw : '';

    const settings = await upsertUnsubscribeSettings(context.workspaceId, {
      enabled,
      pageText,
    });

    return NextResponse.json({ ok: true, settings });
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

    console.error('Save unsubscribe settings failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to save unsubscribe settings.' },
      { status: 500 },
    );
  }
}
