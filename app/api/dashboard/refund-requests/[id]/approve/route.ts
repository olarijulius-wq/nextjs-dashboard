import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { stripe } from '@/app/lib/stripe';
import { fetchStripeConnectStatusForUser } from '@/app/lib/data';
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
import { isStripePermissionOrNoAccessError } from '@/app/lib/stripe-connect';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
const DEBUG = process.env.DEBUG_REFUNDS === 'true';

function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

function readChargeId(
  latestCharge: string | { id: string } | null | undefined,
): string | null {
  if (!latestCharge) return null;
  if (typeof latestCharge === 'string') return latestCharge;
  return typeof latestCharge.id === 'string' ? latestCharge.id : null;
}

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
        { ok: false, message: 'Only owners and admins can approve refunds.' },
        { status: 403 },
      );
    }

    const [row] = await sql<{
      id: string;
      status: 'pending' | 'approved' | 'declined';
      invoice_id: string;
      invoice_status: string;
      stripe_payment_intent_id: string | null;
      user_email: string;
    }[]>`
      select
        rr.id,
        rr.status,
        rr.invoice_id,
        i.status as invoice_status,
        i.stripe_payment_intent_id,
        i.user_email
      from public.refund_requests rr
      join public.invoices i
        on i.id = rr.invoice_id
      where rr.id = ${requestId}
        and rr.workspace_id = ${context.workspaceId}
      limit 1
    `;

    if (!row) {
      return NextResponse.json(
        { ok: false, message: 'Refund request not found.' },
        { status: 404 },
      );
    }

    if (row.status !== 'pending') {
      return NextResponse.json(
        { ok: false, message: 'Refund request is no longer pending.' },
        { status: 409 },
      );
    }

    if (row.invoice_status !== 'paid') {
      return NextResponse.json(
        { ok: false, message: 'Only paid invoices can be refunded from this action.' },
        { status: 409 },
      );
    }

    if (!row.stripe_payment_intent_id) {
      return NextResponse.json(
        { ok: false, message: 'Missing Stripe payment intent on invoice.' },
        { status: 409 },
      );
    }

    const stripeStatus = await fetchStripeConnectStatusForUser(row.user_email);
    const stripeAccount = stripeStatus.accountId;

    if (!stripeAccount) {
      return NextResponse.json(
        { ok: false, message: 'Connected Stripe account is not configured.' },
        { status: 409 },
      );
    }

    const intent = await stripe.paymentIntents.retrieve(
      row.stripe_payment_intent_id,
      {},
      { stripeAccount },
    );
    const chargeId = readChargeId(intent.latest_charge);

    if (!chargeId) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Stripe charge was not found on the payment intent.',
        },
        { status: 409 },
      );
    }

    const refund = await stripe.refunds.create(
      { charge: chargeId },
      {
        stripeAccount,
        idempotencyKey: `refund_request_${row.id}`,
      },
    );

    const updated = await sql<{ id: string }[]>`
      update public.refund_requests
      set
        status = 'approved',
        resolved_at = now(),
        resolved_by_user_email = ${context.userEmail},
        stripe_refund_id = ${refund.id}
      where id = ${row.id}
        and status = 'pending'
      returning id
    `;

    if (updated.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Refund request is no longer pending.' },
        { status: 409 },
      );
    }

    debugLog('[refund request] approved', {
      requestId: row.id,
      invoiceId: row.invoice_id,
      stripeRefundId: refund.id,
      stripeAccount,
    });

    return NextResponse.json({ ok: true, stripeRefundId: refund.id });
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

    if (isStripePermissionOrNoAccessError(error)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            'Connected Stripe account cannot be accessed with the current API key mode.',
        },
        { status: 409 },
      );
    }

    console.error('Approve refund request failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to approve refund request.' },
      { status: 500 },
    );
  }
}
