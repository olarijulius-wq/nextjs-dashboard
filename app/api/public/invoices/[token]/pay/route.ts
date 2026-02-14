import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { createInvoiceCheckoutSession } from '@/app/lib/invoice-checkout';
import { verifyPayToken } from '@/app/lib/pay-link';
import { fetchStripeConnectStatusForUser } from '@/app/lib/data';
import {
  checkConnectedAccountAccess,
  CONNECT_MODE_MISMATCH_MESSAGE,
  getConnectChargeCapabilityStatus,
  isStripePermissionOrNoAccessError,
} from '@/app/lib/stripe-connect';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(
  req: Request,
  props: { params: Promise<{ token: string }> },
) {
  const params = await props.params;
  const payload = verifyPayToken(params.token);

  if (!payload) {
    return NextResponse.json({ error: 'Invalid payment link' }, { status: 400 });
  }

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
    WHERE invoices.id = ${payload.invoiceId}
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
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ?? false;
  const payPageUrl = `${baseUrl}/pay/${params.token}`;
  const payoutsSetupUrl = '/dashboard/settings/payouts';

  try {
    const ownerEmail = normalizeEmail(invoice.user_email);
    const connectStatus = await fetchStripeConnectStatusForUser(ownerEmail);
    const connectedAccountId = connectStatus.accountId;

    if (connectedAccountId) {
      const accessCheck = await checkConnectedAccountAccess(connectedAccountId);
      if (!accessCheck.ok && accessCheck.isModeMismatch) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[public invoice checkout blocked] Stripe Connect mode mismatch', {
            connectedAccountId,
            mode: isTest ? 'test' : 'live',
          });
        }
        return NextResponse.json(
          {
            ok: false,
            code: 'CONNECT_MODE_MISMATCH',
            message: CONNECT_MODE_MISMATCH_MESSAGE,
            actionUrl: payoutsSetupUrl,
          },
          { status: 409 },
        );
      }
      if (!accessCheck.ok) {
        throw new Error(accessCheck.message);
      }

      const capabilityStatus = await getConnectChargeCapabilityStatus(
        connectedAccountId,
      );
      if (!capabilityStatus.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[public invoice checkout blocked] Stripe Connect not ready', {
            connectedAccountId,
            card_payments: capabilityStatus.cardPayments,
            charges_enabled: capabilityStatus.chargesEnabled,
            details_submitted: capabilityStatus.detailsSubmitted,
          });
        }
        return NextResponse.json(
          {
            ok: false,
            code: 'CONNECT_CARD_PAYMENTS_REQUIRED',
            message:
              'Card payments are not enabled on your connected Stripe account. Complete Stripe onboarding to enable card payments.',
            actionUrl: payoutsSetupUrl,
          },
          { status: 409 },
        );
      }
    }

    const checkoutSession = await createInvoiceCheckoutSession(
      {
        id: invoice.id,
        amount: invoice.amount,
        invoice_number: invoice.invoice_number,
        customer_email: invoice.customer_email,
        user_email: ownerEmail,
      },
      baseUrl,
      {
        successUrl: `${payPageUrl}?paid=1`,
        cancelUrl: `${payPageUrl}?canceled=1`,
      },
    );

    const paymentIntentId =
      typeof checkoutSession.payment_intent === 'string'
        ? checkoutSession.payment_intent
        : typeof checkoutSession.payment_intent?.id === 'string'
          ? checkoutSession.payment_intent.id
          : null;
    const updated = await sql<{ id: string }[]>`
      UPDATE invoices
      SET
        stripe_checkout_session_id = ${checkoutSession.id},
        stripe_payment_intent_id = coalesce(${paymentIntentId}, stripe_payment_intent_id)
      WHERE id = ${invoice.id}
      RETURNING id
    `;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[public invoice checkout] persisted stripe ids', {
        invoiceId: invoice.id,
        checkoutSessionId: checkoutSession.id,
        paymentIntentId,
        rows: updated.length,
      });
    }

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: 'Missing Stripe Checkout URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    if (isStripePermissionOrNoAccessError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'CONNECT_MODE_MISMATCH',
          message: CONNECT_MODE_MISMATCH_MESSAGE,
          actionUrl: payoutsSetupUrl,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error?.message ?? 'Stripe error' },
      { status: 500 },
    );
  }
}
