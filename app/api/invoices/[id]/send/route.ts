import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { sql } from '@/app/lib/db';
import { sendInvoiceEmail } from '@/app/lib/invoice-email';
import { getEmailBaseUrl } from '@/app/lib/app-url';
import { canPayInvoiceStatus } from '@/app/lib/invoice-status';
import { revalidatePath } from 'next/cache';
import {
  requireWorkspaceRole,
} from '@/app/lib/workspace-context';
import {
  enforceRateLimit,
  parseQuery,
  parseRouteParams,
  routeUuidParamsSchema,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

const TEST_HOOKS_ENABLED =
  process.env.NODE_ENV === 'test' && process.env.LATELLESS_TEST_MODE === '1';
export const __testHooksEnabled = TEST_HOOKS_ENABLED;

export const __testHooks = {
  authOverride: null as (null | (() => Promise<{ user?: { email?: string | null } | null } | null>)),
  enforceRateLimitOverride: null as
    | (null | ((req: Request, input: {
      bucket: string;
      windowSec: number;
      ipLimit: number;
      userLimit: number;
    }, opts: { userKey: string }) => Promise<Response | null>)),
  requireWorkspaceRoleOverride: null as
    | (null | ((roles: Array<'owner' | 'admin' | 'member'>) => Promise<{ workspaceId: string; role: 'owner' | 'admin' | 'member' }>)),
  sendInvoiceEmailOverride: null as
    | (null | ((input: {
      workspaceId: string;
      invoiceId: string;
      invoiceNumber: string | null;
      amount: number;
      dueDate: string | null;
      customerName: string;
      customerEmail: string;
      userEmail: string;
      baseUrl: string;
    }) => Promise<{ provider: string; sentAt: string }>)),
  revalidatePathOverride: null as (null | ((path: string) => void)),
};

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
  const session = TEST_HOOKS_ENABLED
    ? (__testHooks.authOverride ? await __testHooks.authOverride() : await auth())
    : await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = normalizeEmail(session.user.email);

  const rl = TEST_HOOKS_ENABLED
    ? (__testHooks.enforceRateLimitOverride
      ? await __testHooks.enforceRateLimitOverride(req, {
        bucket: 'invoice_send',
        windowSec: 300,
        ipLimit: 20,
        userLimit: 10,
      }, { userKey: userEmail })
      : await enforceRateLimit(req, {
        bucket: 'invoice_send',
        windowSec: 300,
        ipLimit: 20,
        userLimit: 10,
      }, { userKey: userEmail }))
    : await enforceRateLimit(req, {
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

  const [workspaceScopeMeta] = await sql<{ has_workspace_id: boolean }[]>`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'invoices'
        and column_name = 'workspace_id'
    ) as has_workspace_id
  `;

  let workspaceContext;
  try {
    workspaceContext = TEST_HOOKS_ENABLED
      ? (__testHooks.requireWorkspaceRoleOverride
        ? await __testHooks.requireWorkspaceRoleOverride(['owner', 'admin'])
        : await requireWorkspaceRole(['owner', 'admin']))
      : await requireWorkspaceRole(['owner', 'admin']);
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { ok: false, code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', error: error.message },
          { status },
        );
      }
    }
    throw error;
  }
  const workspaceId = workspaceContext.workspaceId?.trim() || '';
  const useWorkspaceScope = Boolean(workspaceScopeMeta?.has_workspace_id) && workspaceId.length > 0;

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
      and (
        (${useWorkspaceScope} = true and i.workspace_id = ${workspaceId})
        or (${useWorkspaceScope} = false and lower(i.user_email) = ${userEmail})
      )
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
    const baseUrl = getEmailBaseUrl();

    const sent = TEST_HOOKS_ENABLED
      ? (__testHooks.sendInvoiceEmailOverride
        ? await __testHooks.sendInvoiceEmailOverride({
          workspaceId: workspaceContext.workspaceId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: invoice.amount,
          dueDate: invoice.due_date,
          customerName: invoice.customer_name,
          customerEmail: invoice.customer_email.trim(),
          userEmail,
          baseUrl,
        })
        : await sendInvoiceEmail({
          workspaceId: workspaceContext.workspaceId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: invoice.amount,
          dueDate: invoice.due_date,
          customerName: invoice.customer_name,
          customerEmail: invoice.customer_email.trim(),
          userEmail,
          baseUrl,
        }))
      : await sendInvoiceEmail({
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

    const revalidate =
      TEST_HOOKS_ENABLED && __testHooks.revalidatePathOverride
        ? __testHooks.revalidatePathOverride
        : revalidatePath;
    revalidate('/dashboard/invoices');
    revalidate(`/dashboard/invoices/${invoice.id}`);
    revalidate('/dashboard');
    revalidate('/dashboard/onboarding');

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
