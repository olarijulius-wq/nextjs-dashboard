import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { verifyPayToken } from '@/app/lib/pay-link';
import {
  assertRefundRequestsSchemaReady,
  isRefundRequestsMigrationRequiredError,
  isRefundWindowOpen,
  REFUND_REQUESTS_MIGRATION_REQUIRED_CODE,
  normalizeOptionalEmail,
} from '@/app/lib/refund-requests';
import { sendRefundRequestNotificationEmail } from '@/app/lib/email';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
const DEBUG = process.env.DEBUG_REFUNDS === 'true';

function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

function resolveBaseUrl(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : new URL(req.url).origin)
  );
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ token: string }> },
) {
  const params = await props.params;
  const verification = verifyPayToken(params.token);

  if (!verification.ok) {
    const message =
      verification.reason === 'expired'
        ? 'Payment link expired.'
        : 'Invalid payment link.';
    return NextResponse.json(
      { ok: false, message, code: verification.reason },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid request payload.' },
      { status: 400 },
    );
  }

  const reasonRaw = (body as { reason?: unknown })?.reason;
  const payerEmail = normalizeOptionalEmail((body as { payer_email?: unknown })?.payer_email);
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';

  if (reason.length < 10) {
    return NextResponse.json(
      { ok: false, message: 'Please provide at least 10 characters for the reason.' },
      { status: 400 },
    );
  }

  try {
    await assertRefundRequestsSchemaReady();

    const [invoice] = await sql<{
      id: string;
      status: string;
      paid_at: Date | null;
      invoice_number: string | null;
      user_email: string;
      workspace_id: string | null;
    }[]>`
      select
        i.id,
        i.status,
        i.paid_at,
        i.invoice_number,
        i.user_email,
        coalesce(w.id, u.active_workspace_id) as workspace_id
      from public.invoices i
      join public.users u
        on lower(u.email) = lower(i.user_email)
      left join public.workspaces w
        on w.owner_user_id = u.id
      where i.id = ${verification.payload.invoiceId}
      limit 1
    `;

    if (!invoice) {
      return NextResponse.json(
        { ok: false, message: 'Invoice not found.' },
        { status: 404 },
      );
    }

    if (invoice.status !== 'paid') {
      return NextResponse.json(
        { ok: false, message: 'Refund requests are available only for paid invoices.' },
        { status: 400 },
      );
    }

    if (!isRefundWindowOpen(invoice.paid_at)) {
      return NextResponse.json(
        { ok: false, message: 'Refund window closed. Contact the seller.' },
        { status: 400 },
      );
    }

    if (!invoice.workspace_id) {
      return NextResponse.json(
        { ok: false, message: 'Workspace is not configured for this invoice.' },
        { status: 400 },
      );
    }

    const inserted = await sql<{ id: string }[]>`
      insert into public.refund_requests (
        workspace_id,
        invoice_id,
        payer_email,
        reason
      )
      values (
        ${invoice.workspace_id},
        ${invoice.id},
        ${payerEmail},
        ${reason}
      )
      returning id
    `;

    debugLog('[refund request] created', {
      refundRequestId: inserted[0]?.id ?? null,
      invoiceId: invoice.id,
      workspaceId: invoice.workspace_id,
    });

    const invoiceLabel = invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`;
    const refundsUrl = `${resolveBaseUrl(request)}/dashboard/settings/refunds`;

    try {
      await sendRefundRequestNotificationEmail({
        to: invoice.user_email,
        invoiceLabel,
        reason,
        payerEmail,
        refundsUrl,
      });
    } catch (error) {
      console.warn('[refund request] merchant notification failed:', error);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json(
        { ok: false, message: 'A refund request is already pending.' },
        { status: 409 },
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

    console.error('Create refund request failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to submit refund request.' },
      { status: 500 },
    );
  }
}
