import 'server-only';

import { sql } from '@/app/lib/db';

export type InvoiceWorkspaceBillingResolution = {
  invoiceId: string;
  workspaceId: string | null;
  stripeAccountId: string | null;
  stripeCustomerId: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function resolveStripeWorkspaceBillingForInvoice(
  invoiceId: string,
): Promise<InvoiceWorkspaceBillingResolution | null> {
  const [row] = await sql<{
    invoice_id: string;
    workspace_id: string | null;
    workspace_billing_workspace_id: string | null;
    stripe_account_id: string | null;
    stripe_customer_id: string | null;
  }[]>`
    select
      i.id as invoice_id,
      i.workspace_id,
      wb.workspace_id as workspace_billing_workspace_id,
      owner_user.stripe_connect_account_id as stripe_account_id,
      wb.stripe_customer_id
    from public.invoices i
    left join public.workspaces w
      on w.id = i.workspace_id
    left join public.users owner_user
      on owner_user.id = w.owner_user_id
    left join public.workspace_billing wb
      on wb.workspace_id = i.workspace_id
    where i.id = ${invoiceId}
    limit 1
  `;

  if (!row) return null;

  return {
    invoiceId: row.invoice_id,
    workspaceId: row.workspace_id,
    workspaceBillingExists: Boolean(normalizeText(row.workspace_billing_workspace_id)),
    stripeAccountId: normalizeText(row.stripe_account_id),
    stripeCustomerId: normalizeText(row.stripe_customer_id),
  };
}
