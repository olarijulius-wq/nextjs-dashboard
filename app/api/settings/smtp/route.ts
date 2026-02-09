import { NextRequest, NextResponse } from 'next/server';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import {
  fetchWorkspaceEmailSettings,
  isSmtpMigrationRequiredError,
  SMTP_MIGRATION_REQUIRED_CODE,
  upsertWorkspaceEmailSettings,
} from '@/app/lib/smtp-settings';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const settings = await fetchWorkspaceEmailSettings(context.workspaceId);

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: context.userRole === 'owner',
      userRole: context.userRole,
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

    if (isSmtpMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: SMTP_MIGRATION_REQUIRED_CODE,
          message:
            'SMTP requires DB migration 008_add_workspace_email_settings.sql. Run migrations and retry.',
        },
        { status: 503 },
      );
    }

    console.error('Load SMTP settings failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to load SMTP settings.' },
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
        { ok: false, message: 'Only owners can change SMTP settings.' },
        { status: 403 },
      );
    }

    const settings = await upsertWorkspaceEmailSettings(context.workspaceId, body);

    return NextResponse.json({
      ok: true,
      settings,
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

    if (isSmtpMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: SMTP_MIGRATION_REQUIRED_CODE,
          message:
            'SMTP requires DB migration 008_add_workspace_email_settings.sql. Run migrations and retry.',
        },
        { status: 503 },
      );
    }

    if (error instanceof Error) {
      const validationFields = new Set([
        'provider',
        'smtpHost',
        'smtpPort',
        'smtpUsername',
        'smtpPassword',
        'fromEmail',
        'replyTo',
      ]);

      if (validationFields.has(error.message)) {
        return NextResponse.json(
          {
            ok: false,
            message: `Invalid field: ${error.message}`,
          },
          { status: 400 },
        );
      }
    }

    console.error('Save SMTP settings failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to save SMTP settings.' },
      { status: 500 },
    );
  }
}
