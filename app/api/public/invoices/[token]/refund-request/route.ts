import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/app/lib/db';
import { verifyPayToken } from '@/app/lib/pay-link';
import {
  assertRefundRequestsSchemaReady,
  isRefundRequestsMigrationRequiredError,
  isRefundWindowOpen,
  REFUND_REQUESTS_MIGRATION_REQUIRED_CODE,
  normalizeOptionalEmail,
} from '@/app/lib/refund-requests';
import { sendRefundRequestNotificationEmail } from '@/app/lib/email';
import {
  enforceRateLimit,
  parseJsonBody,
  parseRouteParams,
  routeTokenParamsSchema,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

const DEBUG = process.env.DEBUG_REFUNDS === 'true';

const refundRequestBodySchema = z
  .object({
    reason: z.string().trim().min(10).max(2000),
    payer_email: z.string().trim().email().max(254).optional(),
  })
  .strict();

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
  const rateLimitResponse = await enforceRateLimit(
    request,
    {
      bucket: 'public_refund_request',
      windowSec: 600,
      ipLimit: 10,
    },
    {
      failClosed: true,
    },
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const rawParams = await props.params;
  const parsedParams = parseRouteParams(routeTokenParamsSchema, rawParams);
  if (!parsedParams.ok) {
    return parsedParams.response;
  }
  const params = parsedParams.data;
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

  const parsedBody = await parseJsonBody(request, refundRequestBodySchema);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const reason = parsedBody.data.reason;
  const payerEmail = normalizeOptionalEmail(parsedBody.data.payer_email);

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
        i.workspace_id
      from public.invoices i
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
      console.warn('[refund request] workspace_id missing; migration/backfill required', {
        invoiceId: invoice.id,
      });
      return NextResponse.json(
        { ok: false, message: 'Invoice not found.' },
        { status: 404 },
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
