import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { auth } from '@/auth';
import { createInvoiceCheckoutSession } from '@/app/lib/invoice-checkout';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = await props.params;
  const userEmail = normalizeEmail(session.user.email);

  const [invoice] = await sql<{
    id: string;
    amount: number;
    status: string;
    invoice_number: string | null;
    customer_email: string | null;
    user_email: string;
  }[]>`
    SELECT
      invoices.id,
      invoices.amount,
      invoices.status,
      invoices.invoice_number,
      customers.email AS customer_email,
      invoices.user_email
    FROM invoices
    JOIN customers
      ON customers.id = invoices.customer_id
      AND lower(customers.user_email) = ${userEmail}
    WHERE invoices.id = ${params.id}
      AND lower(invoices.user_email) = ${userEmail}
    LIMIT 1
  `;

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

  try {
    const checkoutSession = await createInvoiceCheckoutSession(
      {
        id: invoice.id,
        amount: invoice.amount,
        invoice_number: invoice.invoice_number,
        customer_email: invoice.customer_email,
        user_email: normalizeEmail(invoice.user_email),
      },
      baseUrl,
    );

    await sql`
      UPDATE invoices
      SET stripe_checkout_session_id = ${checkoutSession.id}
      WHERE id = ${invoice.id}
        AND lower(user_email) = ${userEmail}
    `;

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: 'Missing Stripe Checkout URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Stripe error' },
      { status: 500 },
    );
  }
}
