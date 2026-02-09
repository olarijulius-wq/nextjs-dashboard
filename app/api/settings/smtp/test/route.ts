import { NextResponse } from 'next/server';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import {
  isSmtpMigrationRequiredError,
  sendWorkspaceTestEmail,
  SMTP_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/smtp-settings';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner') {
      return NextResponse.json(
        { ok: false, message: 'Only owners can send test emails.' },
        { status: 403 },
      );
    }

    await sendWorkspaceTestEmail({
      workspaceId: context.workspaceId,
      toEmail: context.userEmail,
    });

    return NextResponse.json({ ok: true });
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

    console.error('SMTP test email failed:', error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Failed to send test email.',
      },
      { status: 500 },
    );
  }
}
