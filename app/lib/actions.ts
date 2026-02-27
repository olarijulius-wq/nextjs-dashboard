'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import postgres from 'postgres';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { signIn, auth } from '@/auth';
import { compute2FaBypassHmac } from '@/auth';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getNextInvoiceNumber, upsertCompanyProfile } from '@/app/lib/data';
import { PLAN_CONFIG, resolveEffectivePlan, type PlanId } from '@/app/lib/config';
import { checkRateLimit } from '@/app/lib/rate-limit';
import {
  sendEmailVerification,
  sendPasswordResetEmail,
  sendTwoFactorCodeEmail,
} from '@/app/lib/email';
import { initialLoginState, type LoginState } from '@/app/lib/login-state';
import { logFunnelEvent } from '@/app/lib/funnel-events';
import { fetchCurrentMonthInvoiceMetricCount } from '@/app/lib/usage';
import { requireWorkspaceContext } from '@/app/lib/workspace-context';
import { resolveBillingContext } from '@/app/lib/workspace-billing';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function nameFromEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [localPart] = normalized.split('@');
  const candidate = localPart?.trim();
  return candidate || normalized || 'User';
}

const PENDING_TWO_FACTOR_NONCE_COOKIE = 'pending_2fa_nonce';

function getBaseAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')
  );
}

async function clearPending2FaCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_TWO_FACTOR_NONCE_COOKIE);
}

async function clearTwoFactorChallenge(userId: string) {
  await sql`
    update users
    set two_factor_code_hash = null,
        two_factor_expires_at = null,
        two_factor_attempts = 0
    where id = ${userId}
  `;
}

async function getRecentFailedLoginCount(email: string): Promise<number> {
  const normalizedEmail = normalizeEmail(email);
  const [{ count = '0' } = { count: '0' }] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from login_attempts
    where lower(email) = ${normalizedEmail}
      and success = false
      and attempted_at >= now() - interval '15 minutes'
  `;
  return Number(count);
}

async function recordLoginAttempt(email: string, success: boolean): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  await sql`
    insert into login_attempts (email, success)
    values (${normalizedEmail}, ${success})
  `;
}

const requiredText = (schema: z.ZodTypeAny) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    schema,
  );

const optionalText = (schema: z.ZodTypeAny) =>
  z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, schema.optional());

const OptionalDueDateSchema = optionalText(
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Please enter a valid due date.',
    }),
);

const RequiredDueDateSchema = requiredText(
  z
    .string({
      required_error: 'Please select a due date.',
      invalid_type_error: 'Please select a due date.',
    })
    .min(1, { message: 'Please select a due date.' })
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Please enter a valid due date.',
    }),
);

const BaseInvoiceFormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

const CreateInvoice = BaseInvoiceFormSchema.extend({
  dueDate: RequiredDueDateSchema,
}).omit({ id: true, date: true });

const UpdateInvoice = BaseInvoiceFormSchema.extend({
  dueDate: OptionalDueDateSchema,
}).omit({ id: true, date: true });

const CompanyProfileSchema = z.object({
  companyName: requiredText(
    z.string().min(2, { message: 'Company name must be at least 2 characters.' }),
  ),
  regCode: optionalText(
    z
      .string()
      .max(50, { message: 'Registration code must be 50 characters or less.' }),
  ),
  vatNumber: optionalText(
    z
      .string()
      .max(50, { message: 'VAT number must be 50 characters or less.' }),
  ),
  addressLine1: optionalText(
    z
      .string()
      .max(200, { message: 'Address line 1 must be 200 characters or less.' }),
  ),
  addressLine2: optionalText(
    z
      .string()
      .max(200, { message: 'Address line 2 must be 200 characters or less.' }),
  ),
  city: optionalText(
    z.string().max(200, { message: 'City must be 200 characters or less.' }),
  ),
  country: optionalText(
    z.string().max(200, { message: 'Country must be 200 characters or less.' }),
  ),
  phone: optionalText(z.string()),
  billingEmail: optionalText(
    z.string().email({ message: 'Please enter a valid billing email address.' }),
  ),
  logoUrl: optionalText(
    z.string().url({ message: 'Logo URL must be a valid URL.' }),
  ),
});

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
    dueDate?: string[];
  };
  message?: string | null;
};

export type CreateInvoiceState =
  | { ok: true; invoiceId: string }
  | {
    ok: false;
    code: 'LIMIT_REACHED' | 'VALIDATION' | 'UNKNOWN';
    message: string;
    errors?: State['errors'];
  };

export type DuplicateInvoiceState =
  | { ok: true; invoiceId: string }
  | {
    ok: false;
    code: 'LIMIT_REACHED' | 'NOT_FOUND' | 'UNKNOWN';
    message: string;
  };

export type CompanyProfileState = {
  ok: boolean;
  message: string | null;
  errors?: {
    companyName?: string[];
    regCode?: string[];
    vatNumber?: string[];
    addressLine1?: string[];
    addressLine2?: string[];
    city?: string[];
    country?: string[];
    phone?: string[];
    billingEmail?: string[];
    logoUrl?: string[];
  };
};

// Customer create schema/state
const CustomerSchema = z.object({
  name: z.string().min(1, { message: 'Please enter a customer name.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
});

export type CustomerState = {
  errors?: {
    name?: string[];
    email?: string[];
    imageUrl?: string[];
  };
  message: string;
};

// helper to get current user's email
async function requireUserEmail() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error('Unauthorized');
  return normalizeEmail(email);
}

async function fetchUserPlan(userEmail: string, workspaceId: string): Promise<PlanId> {
  const billing = await resolveBillingContext({
    workspaceId,
    userEmail,
  });
  return resolveEffectivePlan(billing.plan, billing.subscriptionStatus);
}

async function fetchInvoiceCountThisMonth(userEmail: string, workspaceId: string | null) {
  const usage = await fetchCurrentMonthInvoiceMetricCount({
    userEmail,
    workspaceId,
    metric: 'created',
  });
  return usage.count;
}

function buildPlanLimitMessage(used: number, cap: number) {
  return `Monthly invoice limit reached (${used}/${cap}).`;
}

function sanitizeInvoicesReturnTo(returnToRaw: FormDataEntryValue | null): string {
  if (typeof returnToRaw !== 'string') {
    return '/dashboard/invoices';
  }

  const trimmed = returnToRaw.trim();
  if (
    !trimmed.startsWith('/dashboard/invoices') &&
    !trimmed.startsWith('/dashboard/customers')
  ) {
    return '/dashboard/invoices';
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (
      !parsed.pathname.startsWith('/dashboard/invoices') &&
      !parsed.pathname.startsWith('/dashboard/customers')
    ) {
      return '/dashboard/invoices';
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/dashboard/invoices';
  }
}

function sanitizeCustomersReturnTo(returnToRaw: FormDataEntryValue | null): string {
  if (typeof returnToRaw !== 'string') {
    return '/dashboard/customers';
  }

  const trimmed = returnToRaw.trim();
  if (!trimmed.startsWith('/dashboard/customers')) {
    return '/dashboard/customers';
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (!parsed.pathname.startsWith('/dashboard/customers')) {
      return '/dashboard/customers';
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/dashboard/customers';
  }
}

function sanitizeOnboardingReturnTo(returnToRaw: FormDataEntryValue | null): string | null {
  if (typeof returnToRaw !== 'string') {
    return null;
  }

  const trimmed = returnToRaw.trim();
  if (!trimmed.startsWith('/dashboard/onboarding')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (!parsed.pathname.startsWith('/dashboard/onboarding')) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

const MAX_DAILY_INVOICES = 100;

export async function createInvoice(
  prevState: CreateInvoiceState | null,
  formData: FormData,
): Promise<CreateInvoiceState> {
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
    dueDate: formData.get('dueDate'),
  });

  if (!validatedFields.success) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Missing fields. Failed to create invoice.',
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  let userEmail: string;
  let workspaceContext: Awaited<ReturnType<typeof requireWorkspaceContext>>;
  try {
    [userEmail, workspaceContext] = await Promise.all([
      requireUserEmail(),
      requireWorkspaceContext(),
    ]);
  } catch {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Unauthorized.',
    };
  }

  const rate = await checkRateLimit(
    `createInvoice:${userEmail}`,
    20,
    60 * 1000,
  );

  if (!rate.ok) {
    return {
      ok: false,
      code: 'LIMIT_REACHED',
      message:
        'Too many invoices created in a short time. Please wait a moment and try again.',
    };
  }

  const plan = await fetchUserPlan(userEmail, workspaceContext.workspaceId);
  const planConfig = PLAN_CONFIG[plan];

  if (Number.isFinite(planConfig.maxPerMonth)) {
    const invoiceCount = await fetchInvoiceCountThisMonth(userEmail, workspaceContext.workspaceId);

    if (invoiceCount >= planConfig.maxPerMonth) {
      return {
        ok: false,
        code: 'LIMIT_REACHED',
        message: buildPlanLimitMessage(invoiceCount, planConfig.maxPerMonth),
      };
    }
  }

  const [{ count: dailyCount = '0' } = { count: '0' }] = await sql<{
    count: string;
  }[]>`
    select count(*)::text as count
    from invoices
    where lower(user_email) = ${userEmail}
      and workspace_id = ${workspaceContext.workspaceId}
      and date >= current_date
      and date < (current_date + interval '1 day')
  `;

  if (Number(dailyCount) >= MAX_DAILY_INVOICES) {
    return {
      ok: false,
      code: 'LIMIT_REACHED',
      message:
        'Daily safety limit reached (100 invoices per day). Please try again tomorrow.',
    };
  }

  const { customerId, amount, status, dueDate } = validatedFields.data;
  const amountInCents = Math.round(amount * 100);
  const date = new Date().toISOString().split('T')[0];
  let invoiceNumber: string;

  try {
    invoiceNumber = await getNextInvoiceNumber();
  } catch {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Failed to allocate an invoice number.',
    };
  }

  try {
    const created = await sql<{ id: string }[]>`
      INSERT INTO invoices (
        customer_id,
        amount,
        processing_uplift_amount,
        payable_amount,
        platform_fee_amount,
        status,
        date,
        due_date,
        workspace_id,
        user_email,
        invoice_number
      )
      VALUES (
        ${customerId},
        ${amountInCents},
        0,
        ${amountInCents},
        0,
        ${status},
        ${date},
        ${dueDate ?? null},
        ${workspaceContext.workspaceId},
        ${userEmail},
        ${invoiceNumber}
      )
      RETURNING id
    `;

    const invoiceId = created[0]?.id;
    if (!invoiceId) {
      return {
        ok: false,
        code: 'UNKNOWN',
        message: 'Database error. Failed to create invoice.',
      };
    }

    await logFunnelEvent({
      userEmail,
      eventName: 'invoice_created',
      source: 'dashboard',
      meta: { invoiceId },
    });
  } catch {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Database error. Failed to create invoice.',
    };
  }

  const onboardingReturnTo = sanitizeOnboardingReturnTo(formData.get('returnTo'));
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/onboarding');
  revalidatePath('/dashboard/invoices');
  redirect(onboardingReturnTo ?? '/dashboard/invoices');
}

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData,
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
    dueDate: formData.get('dueDate'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  let userEmail: string;
  let workspaceContext: Awaited<ReturnType<typeof requireWorkspaceContext>>;
  try {
    [userEmail, workspaceContext] = await Promise.all([
      requireUserEmail(),
      requireWorkspaceContext(),
    ]);
  } catch {
    return { message: 'Unauthorized.' };
  }

  const { customerId, amount, status, dueDate } = validatedFields.data;
  const amountInCents = amount * 100;
  const returnTo = sanitizeInvoicesReturnTo(formData.get('returnTo'));

  try {
    const updated = await sql`
      UPDATE invoices
      SET
        customer_id = ${customerId},
        amount = ${amountInCents},
        processing_uplift_amount = 0,
        payable_amount = ${amountInCents},
        platform_fee_amount = 0,
        status = ${status},
        due_date = ${dueDate ?? null}
      WHERE id = ${id}
        AND lower(user_email) = ${userEmail}
        AND workspace_id = ${workspaceContext.workspaceId}
      RETURNING id
    `;

    if (updated.length === 0) {
      return {
        message:
          'Not found or you do not have permission to update this invoice.',
      };
    }
  } catch {
    return { message: 'Database Error: Failed to Update Invoice.' };
  }

  revalidatePath('/dashboard/invoices');
  revalidatePath(`/dashboard/invoices/${id}`);

  const nextUrl = new URL(returnTo, 'http://localhost');
  nextUrl.searchParams.set('updated', '1');
  nextUrl.searchParams.set('updatedInvoice', id);
  nextUrl.searchParams.set('highlight', id);
  redirect(`${nextUrl.pathname}?${nextUrl.searchParams.toString()}`);
}

export async function updateInvoiceStatus(
  id: string,
  newStatus: 'pending' | 'paid',
  formData: FormData,
) {
  if (newStatus !== 'pending' && newStatus !== 'paid') {
    return;
  }

  let userEmail: string;
  let workspaceContext: Awaited<ReturnType<typeof requireWorkspaceContext>>;
  try {
    [userEmail, workspaceContext] = await Promise.all([
      requireUserEmail(),
      requireWorkspaceContext(),
    ]);
  } catch {
    return;
  }

  try {
    const updated = await sql<{ customer_id: string }[]>`
      UPDATE invoices
      SET status = ${newStatus}
      WHERE id = ${id}
        AND lower(user_email) = ${userEmail}
        AND workspace_id = ${workspaceContext.workspaceId}
      RETURNING customer_id
    `;

    if (updated.length === 0) {
      return;
    }

    revalidatePath('/dashboard/invoices');
    revalidatePath(`/dashboard/invoices/${id}`);
    revalidatePath(`/dashboard/customers/${updated[0].customer_id}`);
    redirect(`/dashboard/invoices/${id}`);
  } catch {
    return;
  }
}

export async function duplicateInvoice(
  id: string,
  prevState: DuplicateInvoiceState | null,
  formData: FormData,
): Promise<DuplicateInvoiceState> {
  let userEmail: string;
  let workspaceContext: Awaited<ReturnType<typeof requireWorkspaceContext>>;
  try {
    [userEmail, workspaceContext] = await Promise.all([
      requireUserEmail(),
      requireWorkspaceContext(),
    ]);
  } catch {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Unauthorized.',
    };
  }

  const plan = await fetchUserPlan(userEmail, workspaceContext.workspaceId);
  const planConfig = PLAN_CONFIG[plan];

  if (Number.isFinite(planConfig.maxPerMonth)) {
    const invoiceCount = await fetchInvoiceCountThisMonth(userEmail, workspaceContext.workspaceId);

    if (invoiceCount >= planConfig.maxPerMonth) {
      return {
        ok: false,
        code: 'LIMIT_REACHED',
        message: buildPlanLimitMessage(invoiceCount, planConfig.maxPerMonth),
      };
    }
  }

  const [invoice] = await sql<{
    customer_id: string;
    amount: number;
  }[]>`
    select customer_id, amount
    from invoices
    where id = ${id}
      and lower(user_email) = ${userEmail}
      and workspace_id = ${workspaceContext.workspaceId}
    limit 1
  `;

  if (!invoice) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Invoice not found.',
    };
  }

  const date = new Date().toISOString().split('T')[0];
  let invoiceNumber: string;

  try {
    invoiceNumber = await getNextInvoiceNumber();
  } catch {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Failed to allocate an invoice number.',
    };
  }

  try {
    const created = await sql<{ id: string }[]>`
      INSERT INTO invoices (
        customer_id,
        amount,
        processing_uplift_amount,
        payable_amount,
        platform_fee_amount,
        status,
        date,
        workspace_id,
        user_email,
        invoice_number
      )
      VALUES (
        ${invoice.customer_id},
        ${invoice.amount},
        0,
        ${invoice.amount},
        0,
        'pending',
        ${date},
        ${workspaceContext.workspaceId},
        ${userEmail},
        ${invoiceNumber}
      )
      RETURNING id
    `;

    const newInvoiceId = created[0]?.id;
    if (!newInvoiceId) {
      return {
        ok: false,
        code: 'UNKNOWN',
        message: 'Database error. Failed to duplicate invoice.',
      };
    }

    revalidatePath('/dashboard/invoices');
    revalidatePath(`/dashboard/customers/${invoice.customer_id}`);
    redirect(`/dashboard/invoices/${newInvoiceId}`);
  } catch (error) {
    if (
      error instanceof Error &&
      typeof (error as { digest?: string }).digest === 'string' &&
      (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }

    console.error('Duplicate invoice error:', error);
    return {
      ok: false,
      code: 'UNKNOWN',
      message:
        error instanceof Error
          ? error.message
          : 'Database error. Failed to duplicate invoice.',
    };
  }
}

export async function deleteInvoice(id: string) {
  const [userEmail, workspaceContext] = await Promise.all([
    requireUserEmail(),
    requireWorkspaceContext(),
  ]);

  const deleted = await sql`
    DELETE FROM invoices
    WHERE id = ${id}
      AND lower(user_email) = ${userEmail}
      AND workspace_id = ${workspaceContext.workspaceId}
    RETURNING id
  `;

  if (deleted.length === 0) {
    throw new Error(
      'Not found or you do not have permission to delete this invoice.',
    );
  }

  revalidatePath('/dashboard/invoices');
}

// NEW: Create customer
export async function createCustomer(
  prevState: CustomerState,
  formData: FormData,
) {
  const validatedFields = CustomerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Customer.',
    };
  }

  let userEmail: string;
  let workspaceContext: Awaited<ReturnType<typeof requireWorkspaceContext>>;
  try {
    [userEmail, workspaceContext] = await Promise.all([
      requireUserEmail(),
      requireWorkspaceContext(),
    ]);
  } catch {
    return { message: 'Unauthorized.' };
  }

  const { name, email } = validatedFields.data;

  try {
    await sql`
      INSERT INTO customers (name, email, workspace_id, user_email)
      VALUES (${name}, ${email}, ${workspaceContext.workspaceId}, ${userEmail})
    `;

    await logFunnelEvent({
      userEmail,
      eventName: 'customer_created',
      source: 'dashboard',
      meta: { customerEmail: normalizeEmail(email) },
    });
  } catch {
    return { message: 'Database Error: Failed to Create Customer.' };
  }

  const onboardingReturnTo = sanitizeOnboardingReturnTo(formData.get('returnTo'));
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/onboarding');
  revalidatePath('/dashboard/customers');
  redirect(onboardingReturnTo ?? '/dashboard/customers');
}

export async function updateCustomer(
  id: string,
  prevState: CustomerState,
  formData: FormData,
) {
  const validatedFields = CustomerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Customer.',
    };
  }

  let userEmail: string;
  let workspaceContext: Awaited<ReturnType<typeof requireWorkspaceContext>>;
  try {
    [userEmail, workspaceContext] = await Promise.all([
      requireUserEmail(),
      requireWorkspaceContext(),
    ]);
  } catch {
    return { message: 'Unauthorized.' };
  }

  const { name, email } = validatedFields.data;
  const returnTo = sanitizeCustomersReturnTo(formData.get('returnTo'));

  try {
    const updated = await sql`
      UPDATE customers
      SET name = ${name}, email = ${email}
      WHERE id = ${id}
        AND lower(user_email) = ${userEmail}
        AND workspace_id = ${workspaceContext.workspaceId}
      RETURNING id
    `;

    if (updated.length === 0) {
      return {
        message:
          'Not found or you do not have permission to update this customer.',
      };
    }
  } catch {
    return { message: 'Database Error: Failed to Update Customer.' };
  }

  revalidatePath('/dashboard/customers');
  revalidatePath(`/dashboard/customers/${id}`);

  const nextUrl = new URL(returnTo, 'http://localhost');
  nextUrl.searchParams.set('updated', '1');
  nextUrl.searchParams.set('updatedCustomer', id);
  nextUrl.searchParams.set('highlight', id);
  redirect(`${nextUrl.pathname}?${nextUrl.searchParams.toString()}`);
}

export async function deleteCustomer(id: string) {
  const [userEmail, workspaceContext] = await Promise.all([
    requireUserEmail(),
    requireWorkspaceContext(),
  ]);

  // Optional but recommended: delete invoices for this customer first
  await sql`
    DELETE FROM invoices
    WHERE customer_id = ${id}
      AND lower(user_email) = ${userEmail}
      AND workspace_id = ${workspaceContext.workspaceId}
  `;

  const deleted = await sql`
    DELETE FROM customers
    WHERE id = ${id}
      AND lower(user_email) = ${userEmail}
      AND workspace_id = ${workspaceContext.workspaceId}
    RETURNING id
  `;

  if (deleted.length === 0) {
    throw new Error('Not found or you do not have permission to delete this customer.');
  }

  revalidatePath('/dashboard/customers');
  revalidatePath('/dashboard/invoices');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/onboarding');
}

export async function saveCompanyProfile(
  prevState: CompanyProfileState,
  formData: FormData,
): Promise<CompanyProfileState> {
  const validated = CompanyProfileSchema.safeParse({
    companyName: formData.get('companyName'),
    regCode: formData.get('regCode'),
    vatNumber: formData.get('vatNumber'),
    addressLine1: formData.get('addressLine1'),
    addressLine2: formData.get('addressLine2'),
    city: formData.get('city'),
    country: formData.get('country'),
    phone: formData.get('phone'),
    billingEmail: formData.get('billingEmail'),
    logoUrl: formData.get('logoUrl'),
  });

  if (!validated.success) {
    return {
      ok: false,
      message: 'Please correct the errors and try again.',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  try {
    await upsertCompanyProfile({
      company_name: validated.data.companyName,
      reg_code: validated.data.regCode ?? null,
      vat_number: validated.data.vatNumber ?? null,
      address_line1: validated.data.addressLine1 ?? null,
      address_line2: validated.data.addressLine2 ?? null,
      city: validated.data.city ?? null,
      country: validated.data.country ?? null,
      phone: validated.data.phone ?? null,
      billing_email: validated.data.billingEmail ?? null,
      logo_url: validated.data.logoUrl ?? null,
    });

    await logFunnelEvent({
      userEmail: await requireUserEmail(),
      eventName: 'company_saved',
      source: 'dashboard',
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/onboarding');
    revalidatePath('/dashboard/settings');

    return {
      ok: true,
      message: 'Company profile saved.',
    };
  } catch (error) {
    console.error('Company profile save error:', error);
    return {
      ok: false,
      message: 'Failed to save company profile.',
    };
  }
}

const SignupSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  termsAccepted: z.literal(true, {
    errorMap: () => ({
      message: 'You must agree to the Terms and acknowledge the Privacy Policy.',
    }),
  }),
});

export type SignupState = {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    termsAccepted?: string[];
  };
  message?: string | null;
};

export async function registerUser(prevState: SignupState, formData: FormData) {
  const validated = SignupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    termsAccepted: formData.get('termsAccepted') === 'on',
  });

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
      message: 'Missing fields. Failed to create account.',
    };
  }

  const { name, email, password } = validated.data;
  const normalizedEmail = normalizeEmail(email);
  const resolvedName = name?.trim() || nameFromEmail(normalizedEmail);

  let userId: string | null = null;

  try {
    const existing = await sql`
      select id from users where lower(email) = ${normalizedEmail} limit 1
    `;
    if (existing.length > 0) {
      return { message: 'An account with this email already exists.' };
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [inserted] = await sql<{ id: string }[]>`
      insert into users (name, email, password)
      values (${resolvedName}, ${normalizedEmail}, ${password_hash})
      returning id
    `;
    userId = inserted?.id ?? null;
  } catch {
    return { message: 'Database error: failed to create account.' };
  }

  if (userId) {
    const verificationToken = crypto.randomUUID();
    try {
      await sql`
        update users
        set verification_token = ${verificationToken},
            verification_sent_at = now()
        where id = ${userId}
      `;

      const baseUrl = getBaseAppUrl();
      const verifyUrl = `${baseUrl}/verify/${verificationToken}`;

      await sendEmailVerification({ to: normalizedEmail, verifyUrl });
    } catch (error) {
      console.error('Email verification setup failed:', error);
    }

    await logFunnelEvent({
      userEmail: normalizedEmail,
      eventName: 'signup_completed',
      source: 'signup',
      meta: { userId },
    });
  }

  const callbackUrlRaw = formData.get('callbackUrl');
  const callbackUrl =
    typeof callbackUrlRaw === 'string' &&
      callbackUrlRaw.startsWith('/') &&
      !callbackUrlRaw.startsWith('//')
      ? callbackUrlRaw
      : null;
  const loginParams = new URLSearchParams({ signup: 'success' });
  if (callbackUrl) {
    loginParams.set('callbackUrl', callbackUrl);
  }

  redirect(`/login?${loginParams.toString()}`);
}

export async function authenticate(
  prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  void prevState;
  const emailValue = formData.get('email');
  const passwordValue = formData.get('password');

  const validated = z
    .object({
      email: z.string().email({ message: 'Please enter a valid email address.' }),
      password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
    })
    .safeParse({
      email: typeof emailValue === 'string' ? emailValue : '',
      password: typeof passwordValue === 'string' ? passwordValue : '',
    });

  if (!validated.success) {
    return {
      ...initialLoginState,
      message: 'Wrong email or password.',
    };
  }

  const normalizedEmail = normalizeEmail(validated.data.email);
  const password = validated.data.password;
  const redirectTo = formData.get('redirectTo')?.toString() || '/dashboard';

  try {
    const rate = await checkRateLimit(
      `login:${normalizedEmail}`,
      5,
      15 * 60 * 1000,
    );

    if (!rate.ok) {
      return {
        ...initialLoginState,
        message: 'Too many login attempts. Please wait a few minutes and try again.',
        emailForVerification: normalizedEmail,
      };
    }

    const failedCount = await getRecentFailedLoginCount(normalizedEmail);
    if (failedCount >= 10) {
      return {
        ...initialLoginState,
        message: 'Too many login attempts. Please try again in 15 minutes.',
        emailForVerification: normalizedEmail,
      };
    }

    const [user] = await sql<{
      id: string;
      email: string;
      password: string | null;
      is_verified: boolean;
      two_factor_enabled: boolean;
    }[]>`
      select id, email, password, is_verified, two_factor_enabled
      from users
      where lower(email) = ${normalizedEmail}
      limit 1
    `;

    if (!user) {
      await recordLoginAttempt(normalizedEmail, false);
      return {
        ...initialLoginState,
        message: 'Wrong email or password.',
      };
    }

    if (!user.password) {
      await recordLoginAttempt(normalizedEmail, false);
      return {
        ...initialLoginState,
        message: 'Wrong email or password.',
      };
    }

    const passwordsMatch = await bcrypt.compare(password, user.password);
    if (!passwordsMatch) {
      await recordLoginAttempt(normalizedEmail, false);
      return {
        ...initialLoginState,
        message: 'Wrong email or password.',
      };
    }

    if (!user.is_verified) {
      await recordLoginAttempt(normalizedEmail, false);
      return {
        ...initialLoginState,
        message:
          'Your email is not verified yet. Please check your inbox and click the verification link.',
        needsVerification: true,
        emailForVerification: user.email,
      };
    }

    if (!user.two_factor_enabled) {
      await signIn('credentials', {
        email: user.email,
        password,
        redirect: false,
        redirectTo,
      });

      await recordLoginAttempt(normalizedEmail, true);

      return { ...initialLoginState, success: true };
    }

    // Generate the 6-digit OTP and store its hash in the users table
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);

    await sql`
      update users
      set two_factor_code_hash = ${codeHash},
          two_factor_expires_at = now() + interval '10 minutes',
          two_factor_attempts = 0
      where id = ${user.id}
    `;

    await sendTwoFactorCodeEmail({ to: user.email, code });

    // Issue a server-side nonce (NEVER store password material in a cookie).
    //
    // The nonce is a composite string: "<randomPart>|<userId>" so that
    // its meaning is recoverable even after DB deletion (needed because the
    // 2fa-bypass provider in auth.ts deletes the row before signIn completes).
    const randomPart = crypto.randomUUID();
    const compositeNonce = `${randomPart}|${user.id}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await sql`
      -- Purge any expired challenges for this user before inserting a new one
      delete from public.pending_2fa_challenges
      where user_id = ${user.id}
        and expires_at < now();

      insert into public.pending_2fa_challenges (nonce, user_id, expires_at)
      values (${compositeNonce}, ${user.id}, ${expiresAt})
      on conflict (nonce) do nothing
    `;

    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 15 * 60,
      path: '/',
    };
    cookieStore.set(PENDING_TWO_FACTOR_NONCE_COOKIE, compositeNonce, cookieOptions);

    return {
      ...initialLoginState,
      message: 'We have sent a 6-digit login code to your email.',
      needsTwoFactor: true,
      emailForTwoFactor: user.email,
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      typeof (error as { digest?: string }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    await recordLoginAttempt(normalizedEmail, false);
    console.error('Unexpected login error', error);
    return {
      ...initialLoginState,
      message: 'Something went wrong. Please try again.',
    };
  }
}

export async function verifyTwoFactorCode(
  prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  void prevState;

  const codeInput = formData.get('code');
  const code = typeof codeInput === 'string' ? codeInput.trim() : '';
  const redirectTo = formData.get('redirectTo')?.toString() || '/dashboard';

  if (!/^\d{6}$/.test(code)) {
    return {
      ...initialLoginState,
      needsTwoFactor: true,
      message: 'Invalid code. Please try again.',
    };
  }

  const cookieStore = await cookies();
  const pendingNonce = cookieStore.get(PENDING_TWO_FACTOR_NONCE_COOKIE)?.value;

  if (!pendingNonce) {
    await clearPending2FaCookies();
    return {
      ...initialLoginState,
      message: 'Session expired. Please log in again.',
      needsTwoFactor: false,
    };
  }

  // Extract userId from composite nonce format: "<randomPart>|<userId>"
  const nonceParts = pendingNonce.split('|');
  const pendingUserId = nonceParts.length === 2 ? nonceParts[1] : null;

  if (!pendingUserId) {
    await clearPending2FaCookies();
    return {
      ...initialLoginState,
      message: 'Session expired. Please log in again.',
      needsTwoFactor: false,
    };
  }

  // Verify the nonce exists in DB and is not expired
  const [challenge] = await sql<{ user_id: string; expires_at: Date }[]>`
    select user_id, expires_at
    from public.pending_2fa_challenges
    where nonce = ${pendingNonce}
      and user_id = ${pendingUserId}
    limit 1
  `;

  if (!challenge) {
    await clearPending2FaCookies();
    return {
      ...initialLoginState,
      message: 'Session expired. Please log in again.',
      needsTwoFactor: false,
    };
  }

  if (challenge.expires_at < new Date()) {
    // Clean up expired nonce
    await sql`delete from public.pending_2fa_challenges where nonce = ${pendingNonce}`;
    await clearPending2FaCookies();
    return {
      ...initialLoginState,
      message: 'Code expired. Please log in again.',
      needsTwoFactor: false,
    };
  }

  const [user] = await sql<{
    id: string;
    email: string;
    two_factor_enabled: boolean;
    two_factor_code_hash: string | null;
    two_factor_expires_at: Date | null;
    two_factor_attempts: number;
  }[]>`
    select
      id,
      email,
      two_factor_enabled,
      two_factor_code_hash,
      two_factor_expires_at,
      two_factor_attempts
    from users
    where id = ${pendingUserId}
    limit 1
  `;

  if (!user || !user.two_factor_enabled || !user.two_factor_code_hash) {
    if (user?.id) {
      await clearTwoFactorChallenge(user.id);
    }
    await sql`delete from public.pending_2fa_challenges where nonce = ${pendingNonce}`;
    await clearPending2FaCookies();
    return {
      ...initialLoginState,
      message: 'Session expired. Please log in again.',
      needsTwoFactor: false,
    };
  }

  if (
    !user.two_factor_expires_at ||
    user.two_factor_expires_at.getTime() < Date.now()
  ) {
    await clearTwoFactorChallenge(user.id);
    await sql`delete from public.pending_2fa_challenges where nonce = ${pendingNonce}`;
    await clearPending2FaCookies();
    return {
      ...initialLoginState,
      message: 'Code expired. Please log in again.',
      needsTwoFactor: false,
    };
  }

  if ((user.two_factor_attempts ?? 0) >= 5) {
    await clearTwoFactorChallenge(user.id);
    await sql`delete from public.pending_2fa_challenges where nonce = ${pendingNonce}`;
    await clearPending2FaCookies();
    return {
      ...initialLoginState,
      message: 'Too many attempts. Please log in again.',
      needsTwoFactor: false,
    };
  }

  const codeMatches = await bcrypt.compare(code, user.two_factor_code_hash);
  if (!codeMatches) {
    await sql`
      update users
      set two_factor_attempts = coalesce(two_factor_attempts, 0) + 1
      where id = ${user.id}
    `;

    return {
      ...initialLoginState,
      needsTwoFactor: true,
      emailForTwoFactor: user.email,
      message: 'Invalid code. Please try again.',
    };
  }

  // OTP verified — clear all 2FA state
  await clearTwoFactorChallenge(user.id);
  // Delete nonce from DB *before* calling signIn (prevents replay)
  await sql`delete from public.pending_2fa_challenges where nonce = ${pendingNonce}`;
  await clearPending2FaCookies();

  // Complete sign-in via the 2fa-bypass provider.
  // The bypass provider verifies the HMAC server-side and looks up the user
  // by userId embedded in the composite nonce. No password is needed.
  const bypassHmac = compute2FaBypassHmac(pendingNonce);

  try {
    await signIn('2fa-bypass', {
      nonce: pendingNonce,
      hmac: bypassHmac,
      redirect: false,
      redirectTo,
    });
    await recordLoginAttempt(normalizeEmail(user.email), true);
    return { ...initialLoginState, success: true };
  } catch (error) {
    console.error('2FA login completion failed', error);
    return {
      ...initialLoginState,
      message: 'Something went wrong. Please try again.',
      needsTwoFactor: false,
    };
  }
}

export async function enableTwoFactor() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    redirect('/login');
  }

  const normalizedEmail = normalizeEmail(email);
  const [user] = await sql<{ id: string; is_verified: boolean }[]>`
    select id, is_verified
    from users
    where lower(email) = ${normalizedEmail}
    limit 1
  `;

  if (!user?.is_verified) {
    redirect('/dashboard/profile?twoFactor=verify-required');
  }

  await sql`
    update users
    set two_factor_enabled = true
    where id = ${user.id}
  `;

  revalidatePath('/dashboard/profile');
  redirect('/dashboard/profile?twoFactor=enabled');
}

export async function disableTwoFactor() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    redirect('/login');
  }

  const normalizedEmail = normalizeEmail(email);
  await sql`
    update users
    set two_factor_enabled = false,
        two_factor_code_hash = null,
        two_factor_expires_at = null,
        two_factor_attempts = 0
    where lower(email) = ${normalizedEmail}
  `;

  revalidatePath('/dashboard/profile');
  redirect('/dashboard/profile?twoFactor=disabled');
}

export type PasswordResetRequestState = {
  message: string | null;
};

export async function requestPasswordReset(
  prevState: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  void prevState;
  const emailValue = formData.get('email');
  const parsed = z
    .object({ email: z.string().email({ message: 'Please enter a valid email address.' }) })
    .safeParse({ email: typeof emailValue === 'string' ? emailValue : '' });

  if (!parsed.success) {
    return { message: parsed.error.flatten().fieldErrors.email?.[0] ?? 'Please enter a valid email address.' };
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);

  try {
    const [user] = await sql<{ id: string }[]>`
      select id
      from users
      where lower(email) = ${normalizedEmail}
      limit 1
    `;

    if (user) {
      const token = crypto.randomUUID();
      await sql`
        update users
        set password_reset_token = ${token},
            password_reset_sent_at = now()
        where id = ${user.id}
      `;

      const resetUrl = `${getBaseAppUrl()}/reset-password/${token}`;
      await sendPasswordResetEmail({ to: normalizedEmail, resetUrl });
    }
  } catch (error) {
    console.error('Password reset request failed', error);
  }

  return { message: 'If an account exists, we\'ve sent a reset link.' };
}

export type ResetPasswordState = {
  message: string | null;
};

export async function resetPassword(
  prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  void prevState;
  const tokenValue = formData.get('token');
  const passwordValue = formData.get('password');
  const confirmPasswordValue = formData.get('confirmPassword');

  const token = typeof tokenValue === 'string' ? tokenValue.trim() : '';
  const password = typeof passwordValue === 'string' ? passwordValue : '';
  const confirmPassword =
    typeof confirmPasswordValue === 'string' ? confirmPasswordValue : '';

  if (!token) {
    return { message: 'This link is invalid or has expired.' };
  }

  if (password.length < 6) {
    return { message: 'Password must be at least 6 characters.' };
  }

  if (password !== confirmPassword) {
    return { message: 'Passwords do not match.' };
  }

  const [user] = await sql<{ id: string }[]>`
    select id
    from users
    where password_reset_token = ${token}
      and password_reset_sent_at is not null
      and password_reset_sent_at >= now() - interval '1 hour'
    limit 1
  `;

  if (!user) {
    return { message: 'This link is invalid or has expired.' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await sql`
    update users
    set password = ${passwordHash},
        password_reset_token = null,
        password_reset_sent_at = null,
        two_factor_code_hash = null,
        two_factor_expires_at = null,
        two_factor_attempts = 0
    where id = ${user.id}
  `;

  redirect('/login?reset=success');
}
