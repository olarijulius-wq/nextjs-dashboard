import postgres from 'postgres';
import { auth } from '@/auth';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export type SetupState = {
  companyDone: boolean;
  customerDone: boolean;
  invoiceDone: boolean;
  invoiceSentDone: boolean;
};

type SetupSchemaCapabilities = {
  hasCompanyProfilesTable: boolean;
  hasCompanyProfilesWorkspaceId: boolean;
  hasCustomersWorkspaceId: boolean;
  hasInvoicesWorkspaceId: boolean;
  hasInvoiceEmailLogsTable: boolean;
};

async function getSetupSchemaCapabilities(): Promise<SetupSchemaCapabilities> {
  const [tables] = await sql<{
    company_profiles: string | null;
    invoice_email_logs: string | null;
  }[]>`
    select
      to_regclass('public.company_profiles')::text as company_profiles,
      to_regclass('public.invoice_email_logs')::text as invoice_email_logs
  `;
  const columns = await sql<{
    table_name: string;
    column_name: string;
  }[]>`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('company_profiles', 'customers', 'invoices')
      and column_name = 'workspace_id'
  `;

  const columnSet = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));

  return {
    hasCompanyProfilesTable: Boolean(tables?.company_profiles),
    hasCompanyProfilesWorkspaceId: columnSet.has('company_profiles.workspace_id'),
    hasCustomersWorkspaceId: columnSet.has('customers.workspace_id'),
    hasInvoicesWorkspaceId: columnSet.has('invoices.workspace_id'),
    hasInvoiceEmailLogsTable: Boolean(tables?.invoice_email_logs),
  };
}

export async function fetchSetupStateForCurrentUser(): Promise<SetupState> {
  const session = await auth();
  const sessionEmail = session?.user?.email;
  if (!sessionEmail) {
    return {
      companyDone: false,
      customerDone: false,
      invoiceDone: false,
      invoiceSentDone: false,
    };
  }

  const userEmail = normalizeEmail(sessionEmail);
  let workspaceId: string | null = null;

  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    workspaceId = workspaceContext.workspaceId;
  } catch (error) {
    if (!isTeamMigrationRequiredError(error)) {
      console.error('Failed to resolve workspace context for setup state:', error);
    }
  }

  const schema = await getSetupSchemaCapabilities();

  const companyScope =
    schema.hasCompanyProfilesTable &&
    schema.hasCompanyProfilesWorkspaceId &&
    workspaceId
      ? sql`cp.workspace_id = ${workspaceId}`
      : sql`lower(cp.user_email) = ${userEmail}`;
  const customerScope =
    schema.hasCustomersWorkspaceId && workspaceId
      ? sql`c.workspace_id = ${workspaceId}`
      : sql`lower(c.user_email) = ${userEmail}`;
  const invoiceScope =
    schema.hasInvoicesWorkspaceId && workspaceId
      ? sql`i.workspace_id = ${workspaceId}`
      : sql`lower(i.user_email) = ${userEmail}`;

  const companyPromise = schema.hasCompanyProfilesTable
    ? sql<{ done: boolean }[]>`
        select exists (
          select 1
          from public.company_profiles cp
          where ${companyScope}
            and (
              nullif(trim(coalesce(cp.company_name, '')), '') is not null
              or nullif(trim(coalesce(cp.address_line1, '')), '') is not null
              or nullif(trim(coalesce(cp.city, '')), '') is not null
              or nullif(trim(coalesce(cp.country, '')), '') is not null
              or nullif(trim(coalesce(cp.billing_email, '')), '') is not null
            )
        ) as done
      `
    : Promise.resolve([{ done: false }]);

  const customerPromise = sql<{ done: boolean }[]>`
    select exists (
      select 1
      from public.customers c
      where ${customerScope}
    ) as done
  `;

  const invoicePromise = sql<{ done: boolean }[]>`
    select exists (
      select 1
      from public.invoices i
      where ${invoiceScope}
    ) as done
  `;

  const invoiceSentPromise = schema.hasInvoiceEmailLogsTable
    ? schema.hasInvoicesWorkspaceId && workspaceId
      ? sql<{ done: boolean }[]>`
          select exists (
            select 1
            from public.invoice_email_logs l
            join public.invoices i on i.id = l.invoice_id
            where i.workspace_id = ${workspaceId}
              and lower(l.status) = 'sent'
              and coalesce(l.sent_at, l.created_at) >= now() - interval '30 days'
          ) as done
        `
      : sql<{ done: boolean }[]>`
          select exists (
            select 1
            from public.invoice_email_logs l
            where lower(l.user_email) = ${userEmail}
              and lower(l.status) = 'sent'
              and coalesce(l.sent_at, l.created_at) >= now() - interval '30 days'
          ) as done
        `
    : Promise.resolve([{ done: false }]);

  const [companyRow, customerRow, invoiceRow, invoiceSentRow] = await Promise.all([
    companyPromise,
    customerPromise,
    invoicePromise,
    invoiceSentPromise,
  ]);

  return {
    companyDone: Boolean(companyRow[0]?.done),
    customerDone: Boolean(customerRow[0]?.done),
    invoiceDone: Boolean(invoiceRow[0]?.done),
    invoiceSentDone: Boolean(invoiceSentRow[0]?.done),
  };
}
