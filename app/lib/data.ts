import postgres from 'postgres';
import {
  CustomerField,
  CustomerForm,
  CustomerInvoice,
  CustomersTableType,
  CompanyProfile,
  InvoiceDetail,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  LatePayerStat,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';
import { auth } from '@/auth';
import { PLAN_CONFIG, resolveEffectivePlan, type PlanId } from './config';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function requireUserEmail() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error('Unauthorized');
  return normalizeEmail(email);
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
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) return [];

  const normalizedEmail = normalizeEmail(userEmail);

  const data = await sql<{ month: string; revenue: number }[]>`
    SELECT
      to_char(date_trunc('month', date::date), 'Mon YYYY') as month,
      SUM(amount) / 100 as revenue
    FROM invoices
    WHERE
      status = 'paid'
      AND lower(user_email) = ${normalizedEmail}
    GROUP BY date_trunc('month', date::date)
    ORDER BY date_trunc('month', date::date)
  `;

  return data;
}

export async function fetchLatestInvoices() {
  const userEmail = await requireUserEmail();

  try {
    const data = await sql<LatestInvoiceRaw[]>`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE lower(invoices.user_email) = ${userEmail}
        AND lower(customers.user_email) = ${userEmail}
      ORDER BY invoices.date DESC
      LIMIT 5
    `;

    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));

    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  const userEmail = await requireUserEmail();

  try {
    const invoiceCountPromise = sql`
      SELECT COUNT(*) FROM invoices
      WHERE lower(user_email) = ${userEmail}
    `;

    const customerCountPromise = sql`
      SELECT COUNT(*) FROM customers
      WHERE lower(user_email) = ${userEmail}
    `;

    const invoiceStatusPromise = sql`
      SELECT
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
      FROM invoices
      WHERE lower(user_email) = ${userEmail}
    `;

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0][0].count ?? '0');
    const numberOfCustomers = Number(data[1][0].count ?? '0');
    const totalPaidInvoices = formatCurrency(data[2][0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(data[2][0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;

export async function fetchFilteredInvoices(query: string, currentPage: number) {
  const userEmail = await requireUserEmail();
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const invoices = await sql<InvoicesTable[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        invoices.invoice_number,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE lower(invoices.user_email) = ${userEmail}
        AND lower(customers.user_email) = ${userEmail}
        AND (
          customers.name ILIKE ${`%${query}%`} OR
          customers.email ILIKE ${`%${query}%`} OR
          invoices.amount::text ILIKE ${`%${query}%`} OR
          COALESCE(invoices.invoice_number, '') ILIKE ${`%${query}%`} OR
          invoices.date::text ILIKE ${`%${query}%`} OR
          invoices.status ILIKE ${`%${query}%`}
        )
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;

    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  const userEmail = await requireUserEmail();

  try {
    const data = await sql`
      SELECT COUNT(*)
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE lower(invoices.user_email) = ${userEmail}
        AND lower(customers.user_email) = ${userEmail}
        AND (
          customers.name ILIKE ${`%${query}%`} OR
          customers.email ILIKE ${`%${query}%`} OR
          invoices.amount::text ILIKE ${`%${query}%`} OR
          invoices.date::text ILIKE ${`%${query}%`} OR
          invoices.status ILIKE ${`%${query}%`}
        )
    `;

    const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  const userEmail = await requireUserEmail();

  try {
    const data = await sql<InvoiceDetail[]>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status,
        invoices.date,
        invoices.invoice_number,
        customers.name AS customer_name,
        customers.email AS customer_email
      FROM invoices
      JOIN customers
        ON customers.id = invoices.customer_id
        AND lower(customers.user_email) = ${userEmail}
      WHERE invoices.id = ${id}
        AND lower(invoices.user_email) = ${userEmail}
      LIMIT 1
    `;

    return data[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchInvoiceFormById(id: string) {
  const userEmail = await requireUserEmail();

  try {
    const data = await sql<InvoiceForm[]>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id}
        AND lower(invoices.user_email) = ${userEmail}
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
  const userEmail = await requireUserEmail();

  try {
    const customers = await sql<CustomerField[]>`
      SELECT id, name
      FROM customers
      WHERE lower(user_email) = ${userEmail}
      ORDER BY name ASC
    `;

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchCustomerById(id: string) {
  const userEmail = await requireUserEmail();

  try {
    const data = await sql<CustomerForm[]>`
      SELECT id, name, email, image_url
      FROM customers
      WHERE id = ${id}
        AND lower(user_email) = ${userEmail}
      LIMIT 1
    `;

    return data[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer.');
  }
}

export async function fetchInvoicesByCustomerId(customerId: string) {
  const userEmail = await requireUserEmail();

  try {
    const data = await sql<CustomerInvoice[]>`
      SELECT id, amount, status, date
      FROM invoices
      WHERE customer_id = ${customerId}
        AND lower(user_email) = ${userEmail}
      ORDER BY date DESC
    `;

    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer invoices.');
  }
}

export async function fetchLatePayerStats() {
  const userEmail = await requireUserEmail();

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
        AND lower(customers.user_email) = ${userEmail}
      WHERE
        lower(invoices.user_email) = ${userEmail}
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
      ORDER BY avg_delay_days DESC
      LIMIT 10
    `;

    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch late payer stats.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  const userEmail = await requireUserEmail();

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
        AND lower(invoices.user_email) = ${userEmail}
      WHERE lower(customers.user_email) = ${userEmail}
        AND (
          customers.name ILIKE ${`%${query}%`} OR
          customers.email ILIKE ${`%${query}%`}
        )
      GROUP BY customers.id, customers.name, customers.email, customers.image_url
      ORDER BY customers.name ASC
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

export type UserPlanUsage = {
  plan: PlanId;
  isPro: boolean;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | string | null;
  invoiceCount: number;
  maxPerMonth: number;
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

  // loeme korraga: kasutaja plaan + mitu invoice’it tal on
  const [userRows, invoiceRows] = await Promise.all([
    sql<{
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
    `,
    sql<{ count: string }[]>`
      select count(*)::text as count
      from invoices
      where lower(user_email) = ${normalizedEmail}
        and date >= date_trunc('month', current_date)::date
        and date < (date_trunc('month', current_date) + interval '1 month')::date
    `,
  ]);

  const user = userRows[0];
  const plan = resolveEffectivePlan(
    user?.plan ?? null,
    user?.subscription_status ?? null,
  );
  const maxPerMonth = PLAN_CONFIG[plan].maxPerMonth;
  const invoiceCount = Number(invoiceRows[0]?.count ?? '0');

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
