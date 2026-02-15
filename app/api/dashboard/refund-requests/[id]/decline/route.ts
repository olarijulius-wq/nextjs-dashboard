import { NextResponse } from 'next/server';
import postgres from 'postgres';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import {
  assertRefundRequestsSchemaReady,
  isRefundRequestsMigrationRequiredError,
  REFUND_REQUESTS_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/refund-requests';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const requestId = params.id?.trim();

  if (!requestId) {
    return NextResponse.json(
      { ok: false, message: 'Refund request id is required.' },
      { status: 400 },
    );
  }

  try {
    await assertRefundRequestsSchemaReady();
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner' && context.userRole !== 'admin') {
      return NextResponse.json(
        { ok: false, message: 'Only owners and admins can decline refunds.' },
        { status: 403 },
      );
    }

    const updated = await sql<{ id: string }[]>`
      update public.refund_requests
      set
        status = 'declined',
        resolved_at = now(),
        resolved_by_user_email = ${context.userEmail}
      where id = ${requestId}
        and workspace_id = ${context.workspaceId}
        and status = 'pending'
      returning id
    `;

    if (updated.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Refund request is no longer pending.' },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
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

    if (isRefundRequestsMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: REFUND_REQUESTS_MIGRATION_REQUIRED_CODE,
          message: 'Refund requests require DB migration 019_add_refund_requests.sql.',
        },
        { status: 503 },
      );
    }

    console.error('Decline refund request failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to decline refund request.' },
      { status: 500 },
    );
  }
}
