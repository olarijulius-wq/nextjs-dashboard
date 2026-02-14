import { stripe } from '@/app/lib/stripe';
import { PLAN_CONFIG, resolveEffectivePlan } from '@/app/lib/config';
import { fetchStripeConnectStatusForUser } from '@/app/lib/data';
import postgres from 'postgres';

export type InvoiceCheckoutInput = {
  id: string;
  amount: number;
  invoice_number: string | null;
  customer_email: string | null;
  user_email: string;
};

export type InvoiceCheckoutOptions = {
  successUrl?: string;
  cancelUrl?: string;
};

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getInvoiceOwnerStripeConfig(
  userEmail: string,
  totalCents: number,
) {
  const normalizedEmail = normalizeEmail(userEmail);

  const [user] = await sql<{
    plan: string | null;
    subscription_status: string | null;
  }[]>`
    SELECT
      plan,
      subscription_status
    FROM users
    WHERE lower(email) = ${normalizedEmail}
    LIMIT 1
  `;

  const plan = resolveEffectivePlan(
    user?.plan ?? null,
    user?.subscription_status ?? null,
  );
  const platformFeePercent = PLAN_CONFIG[plan].platformFeePercent ?? 0;
  const applicationFeeAmount =
    platformFeePercent > 0
      ? Math.max(0, Math.round((totalCents * platformFeePercent) / 100))
      : 0;
  const connectStatus = await fetchStripeConnectStatusForUser(normalizedEmail);

  return {
    applicationFeeAmount,
    connectAccountId: connectStatus.hasAccount ? connectStatus.accountId : null,
  };
}

export async function createInvoiceCheckoutSession(
  invoice: InvoiceCheckoutInput,
  baseUrl: string,
  options?: InvoiceCheckoutOptions,
) {
  const invoiceLabel =
    invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`;
  const successUrl =
    options?.successUrl ??
    `${baseUrl}/dashboard/invoices/${invoice.id}?paid=1`;
  const cancelUrl =
    options?.cancelUrl ??
    `${baseUrl}/dashboard/invoices/${invoice.id}?canceled=1`;
  const ownerStripeConfig = await getInvoiceOwnerStripeConfig(
    invoice.user_email,
    invoice.amount,
  );
  const paymentIntentData: {
    metadata: Record<string, string>;
    application_fee_amount?: number;
  } = {
    metadata: {
      invoiceId: invoice.id,
      invoice_id: invoice.id,
      user_email: invoice.user_email,
    },
  };

  if (ownerStripeConfig.connectAccountId) {
    // Direct charge: Checkout session is created on the connected account,
    // so Stripe processing fees are paid by the connected account.
    if (ownerStripeConfig.applicationFeeAmount > 0) {
      paymentIntentData.application_fee_amount =
        ownerStripeConfig.applicationFeeAmount;
    }
  }

  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      expand: ['payment_intent'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: invoice.amount,
            product_data: {
              name: `Invoice ${invoiceLabel}`,
            },
          },
        },
      ],
      customer_email: invoice.customer_email ?? undefined,
      metadata: {
        invoiceId: invoice.id,
        invoice_id: invoice.id,
        user_email: invoice.user_email,
      },
      payment_intent_data: paymentIntentData,
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    ownerStripeConfig.connectAccountId
      ? { stripeAccount: ownerStripeConfig.connectAccountId }
      : undefined,
  );
}
