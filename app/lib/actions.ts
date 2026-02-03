'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import postgres from 'postgres';
import { redirect } from 'next/navigation';
import { signIn, auth } from '@/auth';
import { AuthError } from 'next-auth';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getNextInvoiceNumber, upsertCompanyProfile } from '@/app/lib/data';
import { PLAN_CONFIG, resolveEffectivePlan, type PlanId } from '@/app/lib/config';
import { checkRateLimit } from '@/app/lib/rate-limit';
import { sendEmailVerification } from '@/app/lib/email';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

const FormSchema = z.object({
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
  dueDate: optionalText(
    z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'Please enter a valid due date.',
      }),
  ),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

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

async function fetchUserPlan(userEmail: string): Promise<PlanId> {
  const [user] = await sql<
    { plan: string | null; subscription_status: string | null }[]
  >`
    select plan, subscription_status
    from users
    where lower(email) = ${userEmail}
    limit 1
  `;

  return resolveEffectivePlan(user?.plan ?? null, user?.subscription_status ?? null);
}

async function fetchInvoiceCountThisMonth(userEmail: string) {
  const [{ count = '0' } = { count: '0' }] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from invoices
    where lower(user_email) = ${userEmail}
      and date >= date_trunc('month', current_date)::date
      and date < (date_trunc('month', current_date) + interval '1 month')::date
  `;

  return Number(count);
}

function buildPlanLimitMessage(plan: PlanId) {
  const config = PLAN_CONFIG[plan];
  const limitLabel = Number.isFinite(config.maxPerMonth)
    ? `${config.maxPerMonth} invoices per month`
    : 'unlimited invoices';
  return `${config.name} plan limit reached (${limitLabel}). Upgrade your plan to create more invoices.`;
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
  try {
    userEmail = await requireUserEmail();
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

  const plan = await fetchUserPlan(userEmail);
  const planConfig = PLAN_CONFIG[plan];

  if (Number.isFinite(planConfig.maxPerMonth)) {
    const invoiceCount = await fetchInvoiceCountThisMonth(userEmail);

    if (invoiceCount >= planConfig.maxPerMonth) {
      return {
        ok: false,
        code: 'LIMIT_REACHED',
        message: buildPlanLimitMessage(plan),
      };
    }
  }

  const [{ count: dailyCount = '0' } = { count: '0' }] = await sql<{
    count: string;
  }[]>`
    select count(*)::text as count
    from invoices
    where lower(user_email) = ${userEmail}
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
      INSERT INTO invoices (customer_id, amount, status, date, due_date, user_email, invoice_number)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date}, ${dueDate ?? null}, ${userEmail}, ${invoiceNumber})
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
  } catch {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Database error. Failed to create invoice.',
    };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
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
  try {
    userEmail = await requireUserEmail();
  } catch {
    return { message: 'Unauthorized.' };
  }

  const { customerId, amount, status, dueDate } = validatedFields.data;
  const amountInCents = amount * 100;

  try {
    const updated = await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}, due_date = ${dueDate ?? null}
      WHERE id = ${id} AND lower(user_email) = ${userEmail}
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
  redirect('/dashboard/invoices');
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
  try {
    userEmail = await requireUserEmail();
  } catch {
    return;
  }

  try {
    const updated = await sql<{ customer_id: string }[]>`
      UPDATE invoices
      SET status = ${newStatus}
      WHERE id = ${id} AND lower(user_email) = ${userEmail}
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
  try {
    userEmail = await requireUserEmail();
  } catch {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Unauthorized.',
    };
  }

  const plan = await fetchUserPlan(userEmail);
  const planConfig = PLAN_CONFIG[plan];

  if (Number.isFinite(planConfig.maxPerMonth)) {
    const invoiceCount = await fetchInvoiceCountThisMonth(userEmail);

    if (invoiceCount >= planConfig.maxPerMonth) {
      return {
        ok: false,
        code: 'LIMIT_REACHED',
        message: buildPlanLimitMessage(plan),
      };
    }
  }

  const [invoice] = await sql<{
    customer_id: string;
    amount: number;
  }[]>`
    select customer_id, amount
    from invoices
    where id = ${id} and lower(user_email) = ${userEmail}
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
      INSERT INTO invoices (customer_id, amount, status, date, user_email, invoice_number)
      VALUES (${invoice.customer_id}, ${invoice.amount}, 'pending', ${date}, ${userEmail}, ${invoiceNumber})
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
  const userEmail = await requireUserEmail();

  const deleted = await sql`
    DELETE FROM invoices
    WHERE id = ${id} AND lower(user_email) = ${userEmail}
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
  try {
    userEmail = await requireUserEmail();
  } catch {
    return { message: 'Unauthorized.' };
  }

  const { name, email } = validatedFields.data;

  try {
    await sql`
      INSERT INTO customers (name, email, user_email)
      VALUES (${name}, ${email}, ${userEmail})
    `;
  } catch {
    return { message: 'Database Error: Failed to Create Customer.' };
  }

  revalidatePath('/dashboard/customers');
  redirect('/dashboard/customers');
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
  try {
    userEmail = await requireUserEmail();
  } catch {
    return { message: 'Unauthorized.' };
  }

  const { name, email } = validatedFields.data;

  try {
    const updated = await sql`
      UPDATE customers
      SET name = ${name}, email = ${email}
      WHERE id = ${id} AND lower(user_email) = ${userEmail}
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
  redirect('/dashboard/customers');
}

export async function deleteCustomer(id: string) {
  const userEmail = await requireUserEmail();

  // Optional but recommended: delete invoices for this customer first
  await sql`
    DELETE FROM invoices
    WHERE customer_id = ${id} AND lower(user_email) = ${userEmail}
  `;

  const deleted = await sql`
    DELETE FROM customers
    WHERE id = ${id} AND lower(user_email) = ${userEmail}
    RETURNING id
  `;

  if (deleted.length === 0) {
    throw new Error('Not found or you do not have permission to delete this customer.');
  }

  revalidatePath('/dashboard/customers');
  revalidatePath('/dashboard/invoices');
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
  name: z.string().min(1, { message: 'Please enter your name.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

export type SignupState = {
  errors?: { name?: string[]; email?: string[]; password?: string[] };
  message?: string | null;
};

export async function registerUser(prevState: SignupState, formData: FormData) {
  const validated = SignupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
      message: 'Missing fields. Failed to create account.',
    };
  }

  const { name, email, password } = validated.data;
  const normalizedEmail = normalizeEmail(email);

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
      values (${name}, ${normalizedEmail}, ${password_hash})
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

      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.AUTH_URL ||
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000');
      const verifyUrl = `${baseUrl}/verify/${verificationToken}`;

      await sendEmailVerification({ to: normalizedEmail, verifyUrl });
    } catch (error) {
      console.error('Email verification setup failed:', error);
    }
  }

  redirect('/login?signup=success');
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  const emailValue = formData.get('email');
  const email = typeof emailValue === 'string' ? emailValue : '';
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const passwordValue = formData.get('password');
  const password = typeof passwordValue === 'string' ? passwordValue : '';

  try {
    if (normalizedEmail) {
      const rate = await checkRateLimit(
        `login:${normalizedEmail}`,
        5,
        15 * 60 * 1000,
      );

      if (!rate.ok) {
        return 'Too many login attempts. Please wait a few minutes and try again.';
      }

      const failedCount = await getRecentFailedLoginCount(normalizedEmail);
      if (failedCount >= 10) {
        return 'Too many login attempts. Please try again in 15 minutes.';
      }
    }

    await signIn('credentials', {
      email,
      password,
      redirectTo: formData.get('redirectTo')?.toString() || '/dashboard',
    });

    if (normalizedEmail) {
      await recordLoginAttempt(normalizedEmail, true);
    }
  } catch (error) {
    if (error instanceof AuthError) {
      // @ts-ignore - cause is loosely typed in next-auth
      const code = error.cause?.code as string | undefined;
      switch (error.type) {
        case 'CredentialsSignin':
          if (normalizedEmail) {
            await recordLoginAttempt(normalizedEmail, false);
          }
          if (code === 'EMAIL_NOT_VERIFIED') {
            return 'Palun kinnita esmalt oma e-post – vaata postkasti ja kliki verification lingile.';
          }
          if (code === 'INVALID_CREDENTIALS') {
            return 'Vale e-post või parool.';
          }
          return 'Midagi läks valesti. Proovi uuesti.';
        case 'EMAIL_NOT_VERIFIED':
          return 'Palun kinnita esmalt oma e-post – vaata postkasti ja kliki verification lingile.';
        default:
          return 'Midagi läks valesti. Proovi uuesti.';
      }
    }
    console.error('Unexpected login error', error);
    return 'Midagi läks valesti. Proovi uuesti.';
  }
}
