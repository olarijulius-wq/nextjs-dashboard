import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { sql } from '@/app/lib/db';
import { sendInvoiceEmail } from '@/app/lib/invoice-email';
import { getEmailBaseUrl } from '@/app/lib/app-url';
import { canPayInvoiceStatus } from '@/app/lib/invoice-status';
import { revalidatePath } from 'next/cache';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import {
  enforceRateLimit,
  parseQuery,
  parseRouteParams,
  routeUuidParamsSchema,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

const invoiceSendQuerySchema = z
  .object({
    returnTo: z.string().trim().max(256).optional(),
  })
  .strict();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sanitizeReturnTo(value: string | null) {
  if (!value) return '/dashboard/invoices';
  if (
    !value.startsWith('/dashboard/invoices') &&
    !value.startsWith('/dashboard/customers')
  ) {
    return '/dashboard/invoices';
  }
  return value;
}

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = normalizeEmail(session.user.email);

  const rl = await enforceRateLimit(req, {
    bucket: 'invoice_send',
    windowSec: 300,
    ipLimit: 20,
    userLimit: 10,
  }, { userKey: userEmail });
  if (rl) return rl;

  const rawParams = await props.params;
  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
  if (!parsedParams.ok) return parsedParams.response;

  const params = parsedParams.data;
  const parsedQuery = parseQuery(invoiceSendQuerySchema, new URL(req.url));
  if (!parsedQuery.ok) return parsedQuery.response;
  const returnTo = sanitizeReturnTo(parsedQuery.data.returnTo ?? null);

  const [invoice] = await sql<{
    id: string;
    amount: number;
    due_date: string | null;
    status: string;
    invoice_number: string | null;
    customer_id: string;
    customer_name: string;
    customer_email: string | null;
    user_email: string;
  }[]>`
    select
      i.id,
      i.amount,
      i.due_date,
      i.status,
      i.invoice_number,
      i.user_email,
      c.id as customer_id,
      c.name as customer_name,
      c.email as customer_email
    from public.invoices i
    join public.customers c
      on c.id = i.customer_id
    where i.id = ${params.id}
      and lower(i.user_email) = ${userEmail}
    limit 1
  `;

  if (!invoice) {
    return NextResponse.json({ ok: false, error: 'Invoice not found.' }, { status: 404 });
  }

  if (!invoice.customer_email?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        code: 'CUSTOMER_EMAIL_MISSING',
        error: 'Customer email is required before sending.',
        actionUrl: `/dashboard/customers/${invoice.customer_id}/edit?returnTo=${encodeURIComponent(returnTo)}`,
      },
      { status: 409 },
    );
  }

  if (!canPayInvoiceStatus(invoice.status)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVOICE_NOT_SENDABLE',
        error: `Invoice with status "${invoice.status}" cannot be sent.`,
      },
      { status: 409 },
    );
  }

  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    if (workspaceContext.userRole !== 'owner' && workspaceContext.userRole !== 'admin') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', error: 'Only owners or admins can send invoices.' },
        { status: 403 },
      );
    }

    const baseUrl = getEmailBaseUrl();

    const sent = await sendInvoiceEmail({
      workspaceId: workspaceContext.workspaceId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amount: invoice.amount,
      dueDate: invoice.due_date,
      customerName: invoice.customer_name,
      customerEmail: invoice.customer_email.trim(),
      userEmail,
      baseUrl,
    });

    revalidatePath('/dashboard/invoices');
    revalidatePath(`/dashboard/invoices/${invoice.id}`);
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/onboarding');

    return NextResponse.json({
      ok: true,
      sentAt: sent.sentAt,
      provider: sent.provider,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to send invoice email.';
    return NextResponse.json(
      {
        ok: false,
        code: 'INVOICE_SEND_FAILED',
        error: message,
        actionHint: 'Check email provider settings in Settings -> SMTP.',
      },
      { status: 500 },
    );
  }
}
