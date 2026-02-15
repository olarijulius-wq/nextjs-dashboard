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

export async function GET() {
  try {
    await assertRefundRequestsSchemaReady();
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner' && context.userRole !== 'admin') {
      return NextResponse.json(
        {
          ok: false,
          message: 'Only owners and admins can view refund requests.',
        },
        { status: 403 },
      );
    }

    const rows = await sql<{
      id: string;
      created_at: Date;
      invoice_id: string;
      invoice_number: string | null;
      amount: number;
      currency: string;
      payer_email: string | null;
      reason: string;
      status: 'pending' | 'approved' | 'declined';
      resolved_at: Date | null;
      resolved_by_user_email: string | null;
      stripe_refund_id: string | null;
    }[]>`
      select
        rr.id,
        rr.created_at,
        rr.invoice_id,
        i.invoice_number,
        i.amount,
        i.currency,
        rr.payer_email,
        rr.reason,
        rr.status,
        rr.resolved_at,
        rr.resolved_by_user_email,
        rr.stripe_refund_id
      from public.refund_requests rr
      join public.invoices i
        on i.id = rr.invoice_id
      where rr.workspace_id = ${context.workspaceId}
      order by rr.created_at desc
      limit 50
    `;

    return NextResponse.json({
      ok: true,
      requests: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        invoiceId: row.invoice_id,
        invoiceNumber: row.invoice_number,
        amount: row.amount,
        currency: row.currency,
        payerEmail: row.payer_email,
        reason: row.reason,
        status: row.status,
        resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
        resolvedByUserEmail: row.resolved_by_user_email,
        stripeRefundId: row.stripe_refund_id,
      })),
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

    console.error('Load refund requests failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to load refund requests.' },
      { status: 500 },
    );
  }
}
