import postgres from 'postgres';
import {
  CustomerField,
  CustomerForm,
  CustomerInvoice,
  CustomerInvoiceScoped,
  CustomersTableType,
  CompanyProfile,
  InvoiceDetail,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  LatePayerStat,
  Revenue,
  RevenueDay,
} from './definitions';
import { formatCurrency, formatCurrencySuffix } from './utils';
import { auth } from '@/auth';
import { PLAN_CONFIG, resolveEffectivePlan, type PlanId } from './config';
import { fetchCurrentMonthInvoiceMetricCount } from '@/app/lib/usage';
import { requireWorkspaceContext } from '@/app/lib/workspace-context';

const sql = postgres(process.env.POSTGRES_URL!, {
  ssl: 'require',
  prepare: false,
});

const TEST_HOOKS_ENABLED =
  process.env.NODE_ENV === 'test' && process.env.LATELLESS_TEST_MODE === '1';
export const __testHooksEnabled = TEST_HOOKS_ENABLED;

export const __testHooks = {
  requireWorkspaceContextOverride: null as
    | (() => Promise<{ userEmail: string; workspaceId: string }>)
    | null,
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type InvoiceCustomerScope = {
  userEmail: string;
  workspaceId: string;
  hasInvoicesWorkspaceId: boolean;
  hasCustomersWorkspaceId: boolean;
};

let invoiceCustomerScopeMetaPromise:
  | Promise<{ hasInvoicesWorkspaceId: boolean; hasCustomersWorkspaceId: boolean }>
  | null = null;

async function getInvoiceCustomerScopeMeta() {
  if (!invoiceCustomerScopeMetaPromise) {
    invoiceCustomerScopeMetaPromise = (async () => {
      const [row] = await sql<{
        has_invoices_workspace_id: boolean;
        has_customers_workspace_id: boolean;
      }[]>`
        select
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'invoices'
              and column_name = 'workspace_id'
          ) as has_invoices_workspace_id,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'customers'
              and column_name = 'workspace_id'
          ) as has_customers_workspace_id
      `;

      return {
        hasInvoicesWorkspaceId: Boolean(row?.has_invoices_workspace_id),
        hasCustomersWorkspaceId: Boolean(row?.has_customers_workspace_id),
      };
    })();
  }

  return invoiceCustomerScopeMetaPromise;
}

async function requireInvoiceCustomerScope(): Promise<InvoiceCustomerScope> {
  const [context, meta] = await Promise.all([
    TEST_HOOKS_ENABLED
      ? (__testHooks.requireWorkspaceContextOverride
        ? __testHooks.requireWorkspaceContextOverride()
        : requireWorkspaceContext())
      : requireWorkspaceContext(),
    getInvoiceCustomerScopeMeta(),
  ]);

  return {
    userEmail: context.userEmail,
    workspaceId: context.workspaceId,
    hasInvoicesWorkspaceId: meta.hasInvoicesWorkspaceId,
    hasCustomersWorkspaceId: meta.hasCustomersWorkspaceId,
  };
}

function getInvoicesWorkspaceFilter(scope: InvoiceCustomerScope, qualified = false) {
  const workspaceId = scope.workspaceId?.trim();
  if (scope.hasInvoicesWorkspaceId && workspaceId) {
    return qualified
      ? sql`AND invoices.workspace_id = ${workspaceId}`
      : sql`AND workspace_id = ${workspaceId}`;
  }

  return qualified
    ? sql`AND lower(invoices.user_email) = ${scope.userEmail}`
    : sql`AND lower(user_email) = ${scope.userEmail}`;
}

function getCustomersWorkspaceFilter(scope: InvoiceCustomerScope, qualified = false) {
  const workspaceId = scope.workspaceId?.trim();
  if (scope.hasCustomersWorkspaceId && workspaceId) {
    return qualified
      ? sql`AND customers.workspace_id = ${workspaceId}`
      : sql`AND workspace_id = ${workspaceId}`;
  }

  return qualified
    ? sql`AND lower(customers.user_email) = ${scope.userEmail}`
    : sql`AND lower(user_email) = ${scope.userEmail}`;
}

function isUndefinedColumnError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '42703'
  );
}

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '42P01'
  );
}

export async function requireUserEmail() {
  const session = await auth();
  const sessionEmail = session?.user?.email;

  if (typeof sessionEmail === 'string' && sessionEmail.trim() !== '') {
    return normalizeEmail(sessionEmail);
  }

  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (typeof userId === 'string' && userId.trim() !== '') {
    const [row] = await sql<{ email: string }[]>`
      SELECT email
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    const emailFromDb = row?.email;
    if (typeof emailFromDb === 'string' && emailFromDb.trim() !== '') {
      return normalizeEmail(emailFromDb);
    }
  }

  throw new Error('Unauthorized');
}

function getTallinnYear(date: Date = new Date()) {
  const year = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
  }).format(date);
  return Number(year);
}

export async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  const userEmail = await requireUserEmail();

  try {
    const data = await sql<CompanyProfile[]>`
      SELECT
        id,
        user_email,
        company_name,
        reg_code,
        vat_number,
        address_line1,
        address_line2,
        city,
        country,
        phone,
        billing_email,
        logo_url,
        created_at,
        updated_at
      FROM company_profiles
      WHERE lower(user_email) = ${userEmail}
      LIMIT 1
    `;

    return data[0] ?? null;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch company profile.');
  }
}

export async function fetchStripeConnectAccountId(): Promise<string | null> {
  const userEmail = await requireUserEmail();
  const status = await fetchStripeConnectStatusForUser(userEmail);
  return status.accountId;
}

export type StripeConnectStatus = {
  hasAccount: boolean;
  accountId: string | null;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  isReadyForTransfers: boolean;
};

export async function fetchStripeConnectStatusForUser(
  userEmail: string,
): Promise<StripeConnectStatus> {
  const normalizedEmail = normalizeEmail(userEmail);

  try {
    const data = await sql<{
      stripe_connect_account_id: string | null;
      stripe_connect_details_submitted: boolean | null;
      stripe_connect_payouts_enabled: boolean | null;
    }[]>`
      SELECT
        stripe_connect_account_id,
        stripe_connect_details_submitted,
        stripe_connect_payouts_enabled
      FROM public.users
      WHERE lower(email) = ${normalizedEmail}
      LIMIT 1
    `;

    const row = data[0];
    const accountId = row?.stripe_connect_account_id?.trim() || null;
    const hasAccount = !!accountId;
    const detailsSubmitted = !!row?.stripe_connect_details_submitted;
    const payoutsEnabled = !!row?.stripe_connect_payouts_enabled;
    const isReadyForTransfers = hasAccount && payoutsEnabled && detailsSubmitted;

    return {
      hasAccount,
      accountId,
      detailsSubmitted,
      payoutsEnabled,
      isReadyForTransfers,
    };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      hasAccount: false,
      accountId: null,
      detailsSubmitted: false,
      payoutsEnabled: false,
      isReadyForTransfers: false,
    };
  }
}

export async function upsertCompanyProfile(
  profile: Omit<CompanyProfile, 'id' | 'user_email' | 'created_at' | 'updated_at'>,
): Promise<CompanyProfile> {
  const userEmail = await requireUserEmail();

  try {
    const data = await sql<CompanyProfile[]>`
      INSERT INTO company_profiles (
        user_email,
        company_name,
        reg_code,
        vat_number,
        address_line1,
        address_line2,
        city,
        country,
        phone,
        billing_email,
        logo_url
      )
      VALUES (
        ${userEmail},
        ${profile.company_name},
        ${profile.reg_code},
        ${profile.vat_number},
        ${profile.address_line1},
        ${profile.address_line2},
        ${profile.city},
        ${profile.country},
        ${profile.phone},
        ${profile.billing_email},
        ${profile.logo_url}
      )
      ON CONFLICT (user_email)
      DO UPDATE SET
        company_name = EXCLUDED.company_name,
        reg_code = EXCLUDED.reg_code,
        vat_number = EXCLUDED.vat_number,
        address_line1 = EXCLUDED.address_line1,
        address_line2 = EXCLUDED.address_line2,
        city = EXCLUDED.city,
        country = EXCLUDED.country,
        phone = EXCLUDED.phone,
        billing_email = EXCLUDED.billing_email,
        logo_url = EXCLUDED.logo_url,
        updated_at = now()
      RETURNING
        id,
        user_email,
        company_name,
        reg_code,
        vat_number,
        address_line1,
        address_line2,
        city,
        country,
        phone,
        billing_email,
        logo_url,
        created_at,
        updated_at
    `;

    const saved = data[0];
    if (!saved) {
      throw new Error('Failed to upsert company profile.');
    }

    return saved;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to save company profile.');
  }
}

export async function getNextInvoiceNumber() {
  const userEmail = await requireUserEmail();
  const year = getTallinnYear();

  try {
    const [counter] = await sql<{ current_year: number; last_seq: number }[]>`
      INSERT INTO invoice_counters (user_email, current_year, last_seq)
      VALUES (${userEmail}, ${year}, 1)
      ON CONFLICT (user_email)
      DO UPDATE SET
        current_year = CASE
          WHEN invoice_counters.current_year = ${year}
          THEN invoice_counters.current_year
          ELSE ${year}
        END,
        last_seq = CASE
          WHEN invoice_counters.current_year = ${year}
          THEN invoice_counters.last_seq + 1
          ELSE 1
        END,
        updated_at = now()
      RETURNING current_year, last_seq
    `;

    if (!counter) {
      throw new Error('Failed to allocate invoice number.');
    }

    const padded = String(counter.last_seq).padStart(4, '0');
    return `INV-${counter.current_year}-${padded}`;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to allocate invoice number.');
  }
}

export async function fetchRevenue() {
  const scope = await requireInvoiceCustomerScope();

  const data = await sql<{ month: string; revenue: number }[]>`
    SELECT
      to_char(date_trunc('month', date::date), 'YYYY-MM') as month,
      SUM(amount) / 100 as revenue
    FROM invoices
    WHERE
      status = 'paid'
      ${getInvoicesWorkspaceFilter(scope)}
    GROUP BY date_trunc('month', date::date)
    ORDER BY date_trunc('month', date::date)
  `;

  return data;
}

export async function fetchRevenueDaily(days: number = 30): Promise<RevenueDay[]> {
  const scope = await requireInvoiceCustomerScope();

  const safeDays = Math.max(1, Math.floor(days || 30));

  const data = await sql<RevenueDay[]>`
    WITH local_bounds AS (
      SELECT
        date_trunc('day', now() at time zone 'Europe/Tallinn') - (${safeDays}::int - 1) * interval '1 day' as start_day
    )
    SELECT
      to_char(date_trunc('day', paid_at at time zone 'Europe/Tallinn'), 'YYYY-MM-DD') as day,
      SUM(amount) / 100 as revenue
    FROM invoices
    WHERE
      status = 'paid'
      AND paid_at IS NOT NULL
      AND (paid_at at time zone 'Europe/Tallinn') >= (SELECT start_day FROM local_bounds)
      ${getInvoicesWorkspaceFilter(scope)}
    GROUP BY date_trunc('day', paid_at at time zone 'Europe/Tallinn')
    ORDER BY date_trunc('day', paid_at at time zone 'Europe/Tallinn') ASC
  `;

  return data;
}

export async function fetchLatestInvoices() {
  const scope = await requireInvoiceCustomerScope();

  try {
    const data = await sql<LatestInvoiceRaw[]>`
      SELECT
        invoices.amount,
        customers.name,
        customers.image_url,
        customers.email,
        invoices.id,
        invoices.invoice_number,
        invoices.status,
        invoices.due_date
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE 1=1
        ${getInvoicesWorkspaceFilter(scope, true)}
        ${getCustomersWorkspaceFilter(scope, true)}
      ORDER BY invoices.date DESC
      LIMIT 5
    `;

    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrencySuffix(invoice.amount),
    }));

    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  const scope = await requireInvoiceCustomerScope();

  try {
    const invoiceCountRows = await sql`
      SELECT COUNT(*) FROM invoices
      WHERE 1=1
        ${getInvoicesWorkspaceFilter(scope)}
    `;

    const customerCountRows = await sql`
      SELECT COUNT(*) FROM customers
      WHERE 1=1
        ${getCustomersWorkspaceFilter(scope)}
    `;

    const invoiceStatusRows = await sql`
      SELECT
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
      FROM invoices
      WHERE 1=1
        ${getInvoicesWorkspaceFilter(scope)}
    `;

    const numberOfInvoices = Number(invoiceCountRows[0].count ?? '0');
    const numberOfCustomers = Number(customerCountRows[0].count ?? '0');
    const totalPaidInvoices = formatCurrencySuffix(invoiceStatusRows[0].paid ?? '0');
    const totalPendingInvoices = formatCurrencySuffix(invoiceStatusRows[0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      numberOfCustomers: 0,
      numberOfInvoices: 0,
      totalPaidInvoices: formatCurrencySuffix(0),
      totalPendingInvoices: formatCurrencySuffix(0),
    };
  }
}

export type InvoiceStatusFilter = 'all' | 'overdue' | 'unpaid' | 'paid';
export type InvoiceSortKey =
  | 'due_date'
  | 'amount'
  | 'created_at'
  | 'customer'
  | 'status';
export type InvoiceSortDir = 'asc' | 'desc';
export type CustomerSortKey = 'name' | 'email' | 'created_at' | 'total_invoices';
export type CustomerSortDir = 'asc' | 'desc';
export type CustomerInvoiceSortKey = 'due_date' | 'amount' | 'created_at';
export type CustomerInvoiceSortDir = 'asc' | 'desc';
export type LatePayerSortKey =
  | 'days_overdue'
  | 'paid_invoices'
  | 'name'
  | 'email'
  | 'amount';
export type LatePayerSortDir = 'asc' | 'desc';

const DEFAULT_INVOICES_PAGE_SIZE = 50;
const DEFAULT_CUSTOMERS_PAGE_SIZE = 50;
const DEFAULT_LATE_PAYERS_PAGE_SIZE = 100;
const DEFAULT_CUSTOMER_INVOICES_PAGE_SIZE = 25;

const ORDER_BY_SQL_BY_KEY: Record<InvoiceSortKey, (dir: InvoiceSortDir) => string> = {
  due_date: (dir) =>
    `invoices.due_date ${dir.toUpperCase()} NULLS LAST, invoices.date DESC, invoices.id DESC`,
  amount: (dir) =>
    `invoices.amount ${dir.toUpperCase()}, invoices.date DESC, invoices.id DESC`,
  created_at: (dir) =>
    `invoices.date ${dir.toUpperCase()}, invoices.id DESC`,
  customer: (dir) =>
    `lower(customers.name) ${dir.toUpperCase()}, invoices.date DESC, invoices.id DESC`,
  status: (dir) =>
    `lower(invoices.status) ${dir.toUpperCase()}, invoices.date DESC, invoices.id DESC`,
};

const CUSTOMER_ORDER_BY_SQL_BY_KEY: Record<
  CustomerSortKey,
  (dir: CustomerSortDir) => string
> = {
  name: (dir) => `lower(customers.name) ${dir.toUpperCase()}, customers.id DESC`,
  email: (dir) => `lower(customers.email) ${dir.toUpperCase()}, customers.id DESC`,
  created_at: (dir) => `customers.created_at ${dir.toUpperCase()}, customers.id DESC`,
  total_invoices: (dir) => `COUNT(invoices.id) ${dir.toUpperCase()}, lower(customers.name) ASC`,
};

const CUSTOMER_INVOICE_ORDER_BY_SQL_BY_KEY: Record<
  CustomerInvoiceSortKey,
  (dir: CustomerInvoiceSortDir) => string
> = {
  due_date: (dir) => `invoices.due_date ${dir.toUpperCase()} NULLS LAST, invoices.date DESC, invoices.id DESC`,
  amount: (dir) => `invoices.amount ${dir.toUpperCase()}, invoices.date DESC, invoices.id DESC`,
  created_at: (dir) => `invoices.date ${dir.toUpperCase()}, invoices.id DESC`,
};

const LATE_PAYER_ORDER_BY_SQL_BY_KEY: Record<
  LatePayerSortKey,
  (dir: LatePayerSortDir) => string
> = {
  days_overdue: (dir) =>
    `AVG(CASE WHEN invoices.due_date IS NOT NULL THEN (invoices.paid_at::date - invoices.due_date) ELSE (invoices.paid_at::date - invoices.date) END) ${dir.toUpperCase()}, lower(customers.name) ASC`,
  paid_invoices: (dir) =>
    `COUNT(invoices.id) ${dir.toUpperCase()}, lower(customers.name) ASC`,
  amount: (dir) =>
    `COUNT(invoices.id) ${dir.toUpperCase()}, lower(customers.name) ASC`,
  name: (dir) => `lower(customers.name) ${dir.toUpperCase()}, customers.id DESC`,
  email: (dir) => `lower(customers.email) ${dir.toUpperCase()}, customers.id DESC`,
};

function normalizeInvoiceStatusFilter(
  statusFilter: string | undefined,
): InvoiceStatusFilter {
  if (statusFilter === 'overdue' || statusFilter === 'unpaid' || statusFilter === 'paid') {
    return statusFilter;
  }
  return 'all';
}

function normalizeInvoiceSortKey(sortKey: string | undefined): InvoiceSortKey {
  if (
    sortKey === 'due_date' ||
    sortKey === 'amount' ||
    sortKey === 'created_at' ||
    sortKey === 'customer' ||
    sortKey === 'status'
  ) {
    return sortKey;
  }
  return 'created_at';
}

function normalizeInvoiceSortDir(sortDir: string | undefined): InvoiceSortDir {
  if (sortDir === 'asc' || sortDir === 'desc') {
    return sortDir;
  }
  return 'desc';
}

function normalizeInvoicePageSize(pageSize: number | undefined): number {
  if (pageSize === 10 || pageSize === 25 || pageSize === 50 || pageSize === 100) {
    return pageSize;
  }
  return DEFAULT_INVOICES_PAGE_SIZE;
}

function normalizeCustomerSortKey(sortKey: string | undefined): CustomerSortKey {
  if (
    sortKey === 'name' ||
    sortKey === 'email' ||
    sortKey === 'created_at' ||
    sortKey === 'total_invoices'
  ) {
    return sortKey;
  }
  return 'name';
}

function normalizeCustomerSortDir(sortDir: string | undefined): CustomerSortDir {
  if (sortDir === 'asc' || sortDir === 'desc') {
    return sortDir;
  }
  return 'asc';
}

function normalizeCustomerPageSize(pageSize: number | undefined): number {
  if (pageSize === 10 || pageSize === 25 || pageSize === 50 || pageSize === 100) {
    return pageSize;
  }
  return DEFAULT_CUSTOMERS_PAGE_SIZE;
}

function normalizeCustomerInvoiceSortKey(sortKey: string | undefined): CustomerInvoiceSortKey {
  if (sortKey === 'due_date' || sortKey === 'amount' || sortKey === 'created_at') {
    return sortKey;
  }
  return 'due_date';
}

function normalizeCustomerInvoiceSortDir(sortDir: string | undefined): CustomerInvoiceSortDir {
  if (sortDir === 'asc' || sortDir === 'desc') {
    return sortDir;
  }
  return 'asc';
}

function normalizeCustomerInvoicePageSize(pageSize: number | undefined): number {
  if (pageSize === 10 || pageSize === 25 || pageSize === 50 || pageSize === 100) {
    return pageSize;
  }
  return DEFAULT_CUSTOMER_INVOICES_PAGE_SIZE;
}

function normalizeLatePayerSortKey(sortKey: string | undefined): LatePayerSortKey {
  if (
    sortKey === 'days_overdue' ||
    sortKey === 'paid_invoices' ||
    sortKey === 'name' ||
    sortKey === 'email' ||
    sortKey === 'amount'
  ) {
    return sortKey;
  }
  return 'days_overdue';
}

function normalizeLatePayerSortDir(sortDir: string | undefined): LatePayerSortDir {
  if (sortDir === 'asc' || sortDir === 'desc') {
    return sortDir;
  }
  return 'desc';
}

function normalizeLatePayerPageSize(pageSize: number | undefined): number {
  if (pageSize === 25 || pageSize === 50 || pageSize === 100 || pageSize === 200) {
    return pageSize;
  }
  return DEFAULT_LATE_PAYERS_PAGE_SIZE;
}

export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
  statusFilter: string = 'all',
  sortKey: string = 'created_at',
  sortDir: string = 'desc',
  pageSize: number = DEFAULT_INVOICES_PAGE_SIZE,
) {
  const scope = await requireInvoiceCustomerScope();
  const safeCurrentPage = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const safePageSize = normalizeInvoicePageSize(pageSize);
  const offset = (safeCurrentPage - 1) * safePageSize;
  const safeStatusFilter = normalizeInvoiceStatusFilter(statusFilter);
  const safeSortKey = normalizeInvoiceSortKey(sortKey);
  const safeSortDir = normalizeInvoiceSortDir(sortDir);
  const orderByClause = ORDER_BY_SQL_BY_KEY[safeSortKey](safeSortDir);

  try {
    const invoices = await sql<InvoicesTable[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.due_date,
        invoices.status,
        invoices.invoice_number,
        logs.status as last_email_status,
        logs.sent_at as last_email_sent_at,
        logs.error as last_email_error,
        CASE
          WHEN invoices.status = 'pending'
            AND invoices.due_date IS NOT NULL
            AND invoices.due_date < current_date
          THEN (current_date - invoices.due_date)
          ELSE 0
        END AS days_overdue,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      left join lateral (
        select status, sent_at, error
        from public.invoice_email_logs l
        where l.invoice_id = invoices.id
        order by l.created_at desc
        limit 1
      ) logs on true
      WHERE 1=1
        ${getInvoicesWorkspaceFilter(scope, true)}
        ${getCustomersWorkspaceFilter(scope, true)}
        AND (
          ${safeStatusFilter} = 'all'
          OR (${safeStatusFilter} = 'paid' AND invoices.status = 'paid')
          OR (${safeStatusFilter} = 'unpaid' AND invoices.status <> 'paid')
          OR (
            ${safeStatusFilter} = 'overdue'
            AND (
              invoices.status = 'overdue'
              OR (
                invoices.due_date IS NOT NULL
                AND invoices.due_date < current_date
                AND invoices.status <> 'paid'
              )
            )
          )
        )
        AND (
          customers.name ILIKE ${`%${query}%`} OR
          customers.email ILIKE ${`%${query}%`} OR
          invoices.amount::text ILIKE ${`%${query}%`} OR
          COALESCE(invoices.invoice_number, '') ILIKE ${`%${query}%`} OR
          invoices.date::text ILIKE ${`%${query}%`} OR
          invoices.status ILIKE ${`%${query}%`}
        )
      ORDER BY ${sql.unsafe(orderByClause)}
      LIMIT ${safePageSize} OFFSET ${offset}
    `;

    return invoices;
  } catch (error) {
    if (isUndefinedTableError(error)) {
      const invoices = await sql<InvoicesTable[]>`
        SELECT
          invoices.id,
          invoices.amount,
          invoices.date,
          invoices.due_date,
          invoices.status,
          invoices.invoice_number,
          null::text as last_email_status,
          null::timestamptz as last_email_sent_at,
          null::text as last_email_error,
          CASE
            WHEN invoices.status = 'pending'
              AND invoices.due_date IS NOT NULL
              AND invoices.due_date < current_date
            THEN (current_date - invoices.due_date)
            ELSE 0
          END AS days_overdue,
          customers.name,
          customers.email,
          customers.image_url
        FROM invoices
        JOIN customers ON invoices.customer_id = customers.id
        WHERE 1=1
          ${getInvoicesWorkspaceFilter(scope, true)}
          ${getCustomersWorkspaceFilter(scope, true)}
          AND (
            ${safeStatusFilter} = 'all'
            OR (${safeStatusFilter} = 'paid' AND invoices.status = 'paid')
            OR (${safeStatusFilter} = 'unpaid' AND invoices.status <> 'paid')
            OR (
              ${safeStatusFilter} = 'overdue'
              AND (
                invoices.status = 'overdue'
                OR (
                  invoices.due_date IS NOT NULL
                  AND invoices.due_date < current_date
                  AND invoices.status <> 'paid'
                )
              )
            )
          )
          AND (
            customers.name ILIKE ${`%${query}%`} OR
            customers.email ILIKE ${`%${query}%`} OR
            invoices.amount::text ILIKE ${`%${query}%`} OR
            COALESCE(invoices.invoice_number, '') ILIKE ${`%${query}%`} OR
            invoices.date::text ILIKE ${`%${query}%`} OR
            invoices.status ILIKE ${`%${query}%`}
          )
        ORDER BY ${sql.unsafe(orderByClause)}
        LIMIT ${safePageSize} OFFSET ${offset}
      `;
      return invoices;
    }
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(
  query: string,
  statusFilter: string = 'all',
  pageSize: number = DEFAULT_INVOICES_PAGE_SIZE,
) {
  const scope = await requireInvoiceCustomerScope();
  const safeStatusFilter = normalizeInvoiceStatusFilter(statusFilter);
  const safePageSize = normalizeInvoicePageSize(pageSize);

  try {
    const data = await sql`
      SELECT COUNT(*)
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE 1=1
        ${getInvoicesWorkspaceFilter(scope, true)}
        ${getCustomersWorkspaceFilter(scope, true)}
        AND (
          ${safeStatusFilter} = 'all'
          OR (${safeStatusFilter} = 'paid' AND invoices.status = 'paid')
          OR (${safeStatusFilter} = 'unpaid' AND invoices.status <> 'paid')
          OR (
            ${safeStatusFilter} = 'overdue'
            AND (
              invoices.status = 'overdue'
              OR (
                invoices.due_date IS NOT NULL
                AND invoices.due_date < current_date
                AND invoices.status <> 'paid'
              )
            )
          )
        )
        AND (
          customers.name ILIKE ${`%${query}%`} OR
          customers.email ILIKE ${`%${query}%`} OR
          invoices.amount::text ILIKE ${`%${query}%`} OR
          COALESCE(invoices.invoice_number, '') ILIKE ${`%${query}%`} OR
          invoices.date::text ILIKE ${`%${query}%`} OR
          invoices.status ILIKE ${`%${query}%`}
        )
    `;

    const totalPages = Math.ceil(Number(data[0].count) / safePageSize);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  const scope = await requireInvoiceCustomerScope();

  try {
    const data = await sql<InvoiceDetail[]>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.currency,
        invoices.processing_uplift_amount,
        invoices.payable_amount,
        invoices.platform_fee_amount,
        invoices.stripe_processing_fee_amount,
        invoices.stripe_processing_fee_currency,
        invoices.stripe_balance_transaction_id,
        invoices.stripe_net_amount,
        invoices.merchant_net_amount,
        invoices.net_received_amount,
        invoices.status,
        invoices.date,
        invoices.due_date,
        invoices.paid_at,
        invoices.reminder_level,
        invoices.last_reminder_sent_at,
        invoices.invoice_number,
        logs.status as last_email_status,
        logs.sent_at as last_email_sent_at,
        logs.error as last_email_error,
        customers.name AS customer_name,
        customers.email AS customer_email
      FROM invoices
      JOIN customers
        ON customers.id = invoices.customer_id
      left join lateral (
        select status, sent_at, error
        from public.invoice_email_logs l
        where l.invoice_id = invoices.id
        order by l.created_at desc
        limit 1
      ) logs on true
      WHERE invoices.id = ${id}
        ${getInvoicesWorkspaceFilter(scope, true)}
        ${getCustomersWorkspaceFilter(scope, true)}
      LIMIT 1
    `;

    return data[0];
  } catch (error) {
    if (isUndefinedTableError(error)) {
      const fallback = await sql<InvoiceDetail[]>`
        SELECT
          invoices.id,
          invoices.customer_id,
          invoices.amount,
          invoices.currency,
          invoices.processing_uplift_amount,
          invoices.payable_amount,
          invoices.platform_fee_amount,
          invoices.stripe_processing_fee_amount,
          invoices.stripe_processing_fee_currency,
          invoices.stripe_balance_transaction_id,
          invoices.stripe_net_amount,
          invoices.merchant_net_amount,
          invoices.net_received_amount,
          invoices.status,
          invoices.date,
          invoices.due_date,
          invoices.paid_at,
          invoices.reminder_level,
          invoices.last_reminder_sent_at,
          invoices.invoice_number,
          null::text as last_email_status,
          null::timestamptz as last_email_sent_at,
          null::text as last_email_error,
          customers.name AS customer_name,
          customers.email AS customer_email
        FROM invoices
        JOIN customers
          ON customers.id = invoices.customer_id
        WHERE invoices.id = ${id}
          ${getInvoicesWorkspaceFilter(scope, true)}
          ${getCustomersWorkspaceFilter(scope, true)}
        LIMIT 1
      `;
      return fallback[0];
    }
    if (isUndefinedColumnError(error)) {
      const fallback = await sql<InvoiceDetail[]>`
        SELECT
          invoices.id,
          invoices.customer_id,
          invoices.amount,
          invoices.currency,
          null::integer AS processing_uplift_amount,
          null::integer AS payable_amount,
          null::integer AS platform_fee_amount,
          null::integer AS stripe_processing_fee_amount,
          null::text AS stripe_processing_fee_currency,
          null::text AS stripe_balance_transaction_id,
          null::integer AS stripe_net_amount,
          null::integer AS merchant_net_amount,
          null::integer AS net_received_amount,
          invoices.status,
          invoices.date,
          invoices.due_date,
          null::timestamptz AS paid_at,
          null::integer AS reminder_level,
          null::timestamptz AS last_reminder_sent_at,
          invoices.invoice_number,
          null::text AS last_email_status,
          null::timestamptz AS last_email_sent_at,
          null::text AS last_email_error,
          customers.name AS customer_name,
          customers.email AS customer_email
        FROM invoices
        JOIN customers
          ON customers.id = invoices.customer_id
        WHERE invoices.id = ${id}
          ${getInvoicesWorkspaceFilter(scope, true)}
          ${getCustomersWorkspaceFilter(scope, true)}
        LIMIT 1
      `;
      return fallback[0];
    }
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchInvoiceFormById(id: string) {
  const scope = await requireInvoiceCustomerScope();

  try {
    const data = await sql<InvoiceForm[]>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status,
        invoices.due_date
      FROM invoices
      WHERE invoices.id = ${id}
        ${getInvoicesWorkspaceFilter(scope, true)}
    `;

    const invoice = data.map((invoice) => ({
      ...invoice,
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  const scope = await requireInvoiceCustomerScope();

  try {
    const customers = await sql<CustomerField[]>`
      SELECT id, name
      FROM customers
      WHERE 1=1
        ${getCustomersWorkspaceFilter(scope)}
      ORDER BY name ASC
    `;

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchCustomerById(id: string) {
  const scope = await requireInvoiceCustomerScope();

  try {
    const data = await sql<CustomerForm[]>`
      SELECT id, name, email, image_url
      FROM customers
      WHERE id = ${id}
        ${getCustomersWorkspaceFilter(scope)}
      LIMIT 1
    `;

    return data[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer.');
  }
}

export async function fetchInvoicesByCustomerId(customerId: string) {
  const scope = await requireInvoiceCustomerScope();

  try {
    const data = await sql<CustomerInvoice[]>`
      SELECT id, amount, status, date
      FROM invoices
      WHERE customer_id = ${customerId}
        ${getInvoicesWorkspaceFilter(scope)}
      ORDER BY date DESC
    `;

    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer invoices.');
  }
}

export async function fetchCustomerInvoiceSummaryByCustomerId(customerId: string) {
  const scope = await requireInvoiceCustomerScope();

  try {
    const [data] = await sql<{
      total_count: string;
      total_paid: number | null;
      total_unpaid: number | null;
      total_overdue: number | null;
    }[]>`
      SELECT
        COUNT(*)::text AS total_count,
        SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid,
        SUM(CASE WHEN invoices.status <> 'paid' THEN invoices.amount ELSE 0 END) AS total_unpaid,
        SUM(
          CASE
            WHEN invoices.status <> 'paid'
              AND invoices.due_date IS NOT NULL
              AND invoices.due_date < current_date
            THEN invoices.amount
            ELSE 0
          END
        ) AS total_overdue
      FROM invoices
      WHERE invoices.customer_id = ${customerId}
        ${getInvoicesWorkspaceFilter(scope, true)}
    `;

    return {
      totalCount: Number(data?.total_count ?? '0'),
      totalPaid: data?.total_paid ?? 0,
      totalUnpaid: data?.total_unpaid ?? 0,
      totalOverdue: data?.total_overdue ?? 0,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer invoice summary.');
  }
}

export async function fetchFilteredCustomerInvoicesByCustomerId(
  customerId: string,
  query: string,
  currentPage: number = 1,
  statusFilter: string = 'all',
  sortKey: string = 'due_date',
  sortDir: string = 'asc',
  pageSize: number = DEFAULT_CUSTOMER_INVOICES_PAGE_SIZE,
) {
  const scope = await requireInvoiceCustomerScope();
  const safeCurrentPage = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const safeStatusFilter = normalizeInvoiceStatusFilter(statusFilter);
  const safeSortKey = normalizeCustomerInvoiceSortKey(sortKey);
  const safeSortDir = normalizeCustomerInvoiceSortDir(sortDir);
  const safePageSize = normalizeCustomerInvoicePageSize(pageSize);
  const offset = (safeCurrentPage - 1) * safePageSize;
  const orderByClause = CUSTOMER_INVOICE_ORDER_BY_SQL_BY_KEY[safeSortKey](safeSortDir);

  try {
    const data = await sql<CustomerInvoiceScoped[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.status,
        invoices.date,
        invoices.due_date,
        invoices.invoice_number
      FROM invoices
      WHERE invoices.customer_id = ${customerId}
        ${getInvoicesWorkspaceFilter(scope, true)}
        AND (
          ${safeStatusFilter} = 'all'
          OR (${safeStatusFilter} = 'paid' AND invoices.status = 'paid')
          OR (${safeStatusFilter} = 'unpaid' AND invoices.status <> 'paid')
          OR (
            ${safeStatusFilter} = 'overdue'
            AND (
              invoices.status = 'overdue'
              OR (
                invoices.due_date IS NOT NULL
                AND invoices.due_date < current_date
                AND invoices.status <> 'paid'
              )
            )
          )
        )
        AND (
          COALESCE(invoices.invoice_number, '') ILIKE ${`%${query}%`}
          OR invoices.id::text ILIKE ${`%${query}%`}
          OR invoices.amount::text ILIKE ${`%${query}%`}
          OR invoices.status ILIKE ${`%${query}%`}
          OR invoices.date::text ILIKE ${`%${query}%`}
          OR COALESCE(invoices.due_date::text, '') ILIKE ${`%${query}%`}
        )
      ORDER BY ${sql.unsafe(orderByClause)}
      LIMIT ${safePageSize} OFFSET ${offset}
    `;

    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer invoices.');
  }
}

export async function fetchCustomerInvoicesPagesByCustomerId(
  customerId: string,
  query: string,
  statusFilter: string = 'all',
  pageSize: number = DEFAULT_CUSTOMER_INVOICES_PAGE_SIZE,
) {
  const scope = await requireInvoiceCustomerScope();
  const safeStatusFilter = normalizeInvoiceStatusFilter(statusFilter);
  const safePageSize = normalizeCustomerInvoicePageSize(pageSize);

  try {
    const data = await sql`
      SELECT COUNT(*)
      FROM invoices
      WHERE invoices.customer_id = ${customerId}
        ${getInvoicesWorkspaceFilter(scope, true)}
        AND (
          ${safeStatusFilter} = 'all'
          OR (${safeStatusFilter} = 'paid' AND invoices.status = 'paid')
          OR (${safeStatusFilter} = 'unpaid' AND invoices.status <> 'paid')
          OR (
            ${safeStatusFilter} = 'overdue'
            AND (
              invoices.status = 'overdue'
              OR (
                invoices.due_date IS NOT NULL
                AND invoices.due_date < current_date
                AND invoices.status <> 'paid'
              )
            )
          )
        )
        AND (
          COALESCE(invoices.invoice_number, '') ILIKE ${`%${query}%`}
          OR invoices.id::text ILIKE ${`%${query}%`}
          OR invoices.amount::text ILIKE ${`%${query}%`}
          OR invoices.status ILIKE ${`%${query}%`}
          OR invoices.date::text ILIKE ${`%${query}%`}
          OR COALESCE(invoices.due_date::text, '') ILIKE ${`%${query}%`}
        )
    `;

    return Math.ceil(Number(data[0].count) / safePageSize);
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of customer invoices.');
  }
}

export async function fetchLatePayerStats(
  currentPage: number = 1,
  pageSize: number = DEFAULT_LATE_PAYERS_PAGE_SIZE,
  sortKey: string = 'days_overdue',
  sortDir: string = 'desc',
  query: string = '',
) {
  const scope = await requireInvoiceCustomerScope();
  const safeCurrentPage = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const safePageSize = normalizeLatePayerPageSize(pageSize);
  const offset = (safeCurrentPage - 1) * safePageSize;
  const safeSortKey = normalizeLatePayerSortKey(sortKey);
  const safeSortDir = normalizeLatePayerSortDir(sortDir);
  const orderByClause = LATE_PAYER_ORDER_BY_SQL_BY_KEY[safeSortKey](safeSortDir);

  try {
    const data = await sql<LatePayerStat[]>`
      SELECT
        customers.id AS customer_id,
        customers.name,
        customers.email,
        COUNT(invoices.id)::int AS paid_invoices,
        AVG(
          CASE
            WHEN invoices.due_date IS NOT NULL
            THEN (invoices.paid_at::date - invoices.due_date)
            ELSE (invoices.paid_at::date - invoices.date)
          END
        )::float AS avg_delay_days
      FROM invoices
      JOIN customers
        ON customers.id = invoices.customer_id
        ${getCustomersWorkspaceFilter(scope, true)}
      WHERE
        1=1
        ${getInvoicesWorkspaceFilter(scope, true)}
        AND (
          customers.name ILIKE ${`%${query}%`}
          OR customers.email ILIKE ${`%${query}%`}
          OR COALESCE(invoices.invoice_number, '') ILIKE ${`%${query}%`}
        )
        AND invoices.status = 'paid'
        AND invoices.paid_at IS NOT NULL
        AND (
          CASE
            WHEN invoices.due_date IS NOT NULL
            THEN (invoices.paid_at::date - invoices.due_date)
            ELSE (invoices.paid_at::date - invoices.date)
          END
        ) > 0
      GROUP BY customers.id, customers.name, customers.email
      ORDER BY ${sql.unsafe(orderByClause)}
      LIMIT ${safePageSize} OFFSET ${offset}
    `;

    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch late payer stats.');
  }
}

export async function fetchLatePayerPages(query: string = '', pageSize: number = DEFAULT_LATE_PAYERS_PAGE_SIZE) {
  const scope = await requireInvoiceCustomerScope();
  const safePageSize = normalizeLatePayerPageSize(pageSize);

  try {
    const data = await sql`
      SELECT COUNT(*)
      FROM (
        SELECT customers.id
        FROM invoices
        JOIN customers
          ON customers.id = invoices.customer_id
          ${getCustomersWorkspaceFilter(scope, true)}
        WHERE
          1=1
          ${getInvoicesWorkspaceFilter(scope, true)}
          AND (
            customers.name ILIKE ${`%${query}%`}
            OR customers.email ILIKE ${`%${query}%`}
            OR COALESCE(invoices.invoice_number, '') ILIKE ${`%${query}%`}
          )
          AND invoices.status = 'paid'
          AND invoices.paid_at IS NOT NULL
          AND (
            CASE
              WHEN invoices.due_date IS NOT NULL
              THEN (invoices.paid_at::date - invoices.due_date)
              ELSE (invoices.paid_at::date - invoices.date)
            END
          ) > 0
        GROUP BY customers.id
      ) late_payers
    `;

    return Math.ceil(Number(data[0].count) / safePageSize);
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of late payers.');
  }
}

export async function fetchFilteredCustomers(
  query: string,
  currentPage: number = 1,
  pageSize: number = DEFAULT_CUSTOMERS_PAGE_SIZE,
  sortKey: string = 'name',
  sortDir: string = 'asc',
) {
  const scope = await requireInvoiceCustomerScope();
  const safeCurrentPage = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const safePageSize = normalizeCustomerPageSize(pageSize);
  const offset = (safeCurrentPage - 1) * safePageSize;
  const safeSortKey = normalizeCustomerSortKey(sortKey);
  const safeSortDir = normalizeCustomerSortDir(sortDir);
  const orderByClause = CUSTOMER_ORDER_BY_SQL_BY_KEY[safeSortKey](safeSortDir);

  try {
    const data = await sql<CustomersTableType[]>`
      SELECT
        customers.id,
        customers.name,
        customers.email,
        customers.image_url,
        COUNT(invoices.id) AS total_invoices,
        SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
        SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
      FROM customers
      LEFT JOIN invoices
        ON customers.id = invoices.customer_id
        ${getInvoicesWorkspaceFilter(scope, true)}
      WHERE 1=1
        ${getCustomersWorkspaceFilter(scope, true)}
        AND (
          customers.name ILIKE ${`%${query}%`} OR
          customers.email ILIKE ${`%${query}%`}
        )
      GROUP BY customers.id, customers.name, customers.email, customers.image_url
      ORDER BY ${sql.unsafe(orderByClause)}
      LIMIT ${safePageSize} OFFSET ${offset}
    `;

    const customers = data.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}

export async function fetchCustomersPages(
  query: string,
  pageSize: number = DEFAULT_CUSTOMERS_PAGE_SIZE,
) {
  const scope = await requireInvoiceCustomerScope();
  const safePageSize = normalizeCustomerPageSize(pageSize);

  try {
    const data = await sql`
      SELECT COUNT(*)
      FROM customers
      WHERE 1=1
        ${getCustomersWorkspaceFilter(scope, true)}
        AND (
          customers.name ILIKE ${`%${query}%`} OR
          customers.email ILIKE ${`%${query}%`}
        )
    `;

    return Math.ceil(Number(data[0].count) / safePageSize);
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch total number of customers.');
  }
}

export type UserPlanUsage = {
  plan: PlanId;
  isPro: boolean;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | string | null;
  invoiceCount: number;
  maxPerMonth: number;
};

export type UserInvoiceUsageProgress = {
  planId: PlanId;
  maxPerMonth: number | null;
  usedThisMonth: number;
  percentUsed: number;
};

export async function fetchUserPlanAndUsage(): Promise<UserPlanUsage> {
  const session = await auth();
  const email = session?.user?.email;
  const freeLimit = PLAN_CONFIG.free.maxPerMonth;

  // Kui mingil põhjusel sessiooni pole, käitume kui free user 0 invoice’iga
  if (!email) {
    return {
      plan: 'free' as PlanId,
      isPro: false,
      subscriptionStatus: null as string | null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null as Date | string | null,
      invoiceCount: 0,
      maxPerMonth: freeLimit,
    };
  }

  const normalizedEmail = normalizeEmail(email);
  const workspaceContext = await requireWorkspaceContext();

  // loeme korraga: kasutaja plaan + mitu invoice’it tal on
  const userRows = await sql<{
    is_pro: boolean | null;
    subscription_status: string | null;
    cancel_at_period_end: boolean | null;
    current_period_end: Date | string | null;
    plan: string | null;
  }[]>`
    select is_pro, subscription_status, cancel_at_period_end, current_period_end, plan
    from users
    where lower(email) = ${normalizedEmail}
    limit 1
  `;

  const invoiceMetricUsage = await fetchCurrentMonthInvoiceMetricCount({
    userEmail: normalizedEmail,
    workspaceId: workspaceContext.workspaceId,
    metric: 'created',
  });

  const user = userRows[0];
  const plan = resolveEffectivePlan(
    user?.plan ?? null,
    user?.subscription_status ?? null,
  );
  const maxPerMonth = PLAN_CONFIG[plan].maxPerMonth;
  const invoiceCount = invoiceMetricUsage.count;

  return {
    plan,
    isPro: !!user?.is_pro,
    subscriptionStatus: user?.subscription_status ?? null,
    cancelAtPeriodEnd: user?.cancel_at_period_end ?? false,
    currentPeriodEnd: user?.current_period_end ?? null,
    invoiceCount,
    maxPerMonth,
  };
}

export async function fetchUserInvoiceUsageProgress(): Promise<UserInvoiceUsageProgress> {
  const usage = await fetchUserPlanAndUsage();
  const maxPerMonth = Number.isFinite(usage.maxPerMonth) ? usage.maxPerMonth : null;
  const usedThisMonth = usage.invoiceCount;
  const percentUsed =
    maxPerMonth === null
      ? 0
      : maxPerMonth <= 0
        ? 1
        : usedThisMonth / maxPerMonth;

  return {
    planId: usage.plan,
    maxPerMonth,
    usedThisMonth,
    percentUsed,
  };
}
