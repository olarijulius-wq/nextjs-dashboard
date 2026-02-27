import { stripe } from '@/app/lib/stripe';
import { fetchStripeConnectStatusForUser } from '@/app/lib/data';
import {
  computeInvoiceFeeBreakdownForUser,
  type InvoiceFeeBreakdown,
} from '@/app/lib/pricing-fees';
import type Stripe from 'stripe';

export type InvoiceCheckoutInput = {
  id: string;
  amount: number;
  invoice_number: string | null;
  customer_email: string | null;
  user_email: string;
  workspace_id?: string | null;
};

export type InvoiceCheckoutOptions = {
  successUrl?: string;
  cancelUrl?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getInvoiceOwnerStripeConfig(
  userEmail: string,
  baseAmountCents: number,
) {
  const normalizedEmail = normalizeEmail(userEmail);
  const feeBreakdown = await computeInvoiceFeeBreakdownForUser(
    normalizedEmail,
    baseAmountCents,
  );
  const connectStatus = await fetchStripeConnectStatusForUser(normalizedEmail);

  return {
    feeBreakdown,
    applicationFeeAmount: feeBreakdown.platformFeeAmount,
    connectAccountId: connectStatus.hasAccount ? connectStatus.accountId : null,
  };
}

export async function createInvoiceCheckoutSession(
  invoice: InvoiceCheckoutInput,
  baseUrl: string,
  options?: InvoiceCheckoutOptions,
): Promise<{
  checkoutSession: Stripe.Checkout.Session;
  feeBreakdown: InvoiceFeeBreakdown;
}> {
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
  if (!ownerStripeConfig.connectAccountId) {
    throw new Error('CONNECT_REQUIRED');
  }
  const paymentIntentData: {
    metadata: Record<string, string>;
    application_fee_amount?: number;
  } = {
    metadata: {
      invoiceId: invoice.id,
      invoice_id: invoice.id,
      user_email: invoice.user_email,
      ...(invoice.workspace_id ? { workspace_id: invoice.workspace_id } : {}),
    },
  };

  // Direct charge: Checkout session is created on the connected account,
  // so Stripe processing fees are paid by the connected account.
  if (ownerStripeConfig.applicationFeeAmount > 0) {
    paymentIntentData.application_fee_amount =
      ownerStripeConfig.applicationFeeAmount;
  }

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      expand: ['payment_intent'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: ownerStripeConfig.feeBreakdown.payableAmount,
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
        ...(invoice.workspace_id ? { workspace_id: invoice.workspace_id } : {}),
      },
      payment_intent_data: paymentIntentData,
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    { stripeAccount: ownerStripeConfig.connectAccountId },
  );

  return {
    checkoutSession,
    feeBreakdown: ownerStripeConfig.feeBreakdown,
  };
}
