import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/app/lib/db';
import {
  enforceRateLimit,
  parseRouteParams,
  routeUuidParamsSchema,
} from '@/app/lib/security/api-guard';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { canPayInvoiceStatus } from '@/app/lib/invoice-status';
import { generatePayToken } from '@/app/lib/pay-link';

export const runtime = 'nodejs';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = normalizeEmail(session.user.email);
  const rl = await enforceRateLimit(
    req,
    {
      bucket: 'invoice_pay_link',
      windowSec: 60,
      ipLimit: 40,
      userLimit: 30,
    },
    { userKey: userEmail },
  );
  if (rl) return rl;

  const rawParams = await props.params;
  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
  if (!parsedParams.ok) return parsedParams.response;
  const params = parsedParams.data;

  const workspaceContext = await ensureWorkspaceContextForCurrentUser();

  const [invoice] = await sql<{
    id: string;
    status: string;
    workspace_id: string | null;
  }[]>`
    SELECT id, status, workspace_id
    FROM invoices
    WHERE id = ${params.id}
    LIMIT 1
  `;

  if (!invoice || !invoice.workspace_id) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.workspace_id.trim() !== workspaceContext.workspaceId.trim()) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (!canPayInvoiceStatus(invoice.status)) {
    return NextResponse.json(
      {
        error: 'Invoice status does not allow payment',
        code: 'INVOICE_STATUS_NOT_PAYABLE',
        status: invoice.status,
      },
      { status: 409 },
    );
  }

  const token = generatePayToken(invoice.id);
  const payUrl = new URL(`/pay/${token}`, req.url);
  return NextResponse.redirect(payUrl, { status: 303 });
}
