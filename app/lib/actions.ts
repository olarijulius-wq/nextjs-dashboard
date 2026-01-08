'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import postgres from 'postgres';
import { redirect } from 'next/navigation';
import { signIn, auth } from '@/auth';
import { AuthError } from 'next-auth';
import bcrypt from 'bcrypt';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

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
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
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
  return email;
}

export async function createInvoice(
  prevState: State,
  formData: FormData,
) {
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing fields. Failed to create invoice.',
    };
  }

  let userEmail: string;
  try {
    userEmail = await requireUserEmail();
  } catch {
    return { message: 'Unauthorized.' };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = Math.round(amount * 100);
  const date = new Date().toISOString().split('T')[0];

  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date, user_email)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date}, ${userEmail})
    `;
  } catch {
    return { message: 'Database error. Failed to create invoice.' };
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

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  try {
    const updated = await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id} AND user_email = ${userEmail}
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

export async function deleteInvoice(id: string) {
  const userEmail = await requireUserEmail();

  const deleted = await sql`
    DELETE FROM invoices
    WHERE id = ${id} AND user_email = ${userEmail}
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

export async function deleteCustomer(id: string) {
  const userEmail = await requireUserEmail();

  // Optional but recommended: delete invoices for this customer first
  await sql`
    DELETE FROM invoices
    WHERE customer_id = ${id} AND user_email = ${userEmail}
  `;

  const deleted = await sql`
    DELETE FROM customers
    WHERE id = ${id} AND user_email = ${userEmail}
    RETURNING id
  `;

  if (deleted.length === 0) {
    throw new Error('Not found or you do not have permission to delete this customer.');
  }

  revalidatePath('/dashboard/customers');
  revalidatePath('/dashboard/invoices');
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
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await sql`
      select id from users where lower(email) = ${normalizedEmail} limit 1
    `;
    if (existing.length > 0) {
      return { message: 'An account with this email already exists.' };
    }

    const password_hash = await bcrypt.hash(password, 10);

    await sql`
      insert into users (name, email, password)
      values (${name}, ${normalizedEmail}, ${password_hash})
    `;
  } catch {
    return { message: 'Database error: failed to create account.' };
  }

  redirect('/login?signup=success');
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}
