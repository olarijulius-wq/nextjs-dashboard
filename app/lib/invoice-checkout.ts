import { stripe } from '@/app/lib/stripe';
import {
  computeInvoiceFeeBreakdownForWorkspace,
  type InvoiceFeeBreakdown,
} from '@/app/lib/pricing-fees';
import type Stripe from 'stripe';

export type InvoiceCheckoutInput = {
  id: string;
  amount: number;
  invoice_number: string | null;
  customer_email: string | null;
  workspace_id: string;
  stripe_account_id: string;
  stripe_customer_id?: string | null;
};

export type InvoiceCheckoutOptions = {
  successUrl?: string;
  cancelUrl?: string;
};

async function getInvoiceWorkspaceStripeConfig(
  workspaceId: string,
  baseAmountCents: number,
) {
  const feeBreakdown = await computeInvoiceFeeBreakdownForWorkspace(
    workspaceId,
    baseAmountCents,
  );

  return {
    feeBreakdown,
    applicationFeeAmount: feeBreakdown.platformFeeAmount,
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
  const ownerStripeConfig = await getInvoiceWorkspaceStripeConfig(
    invoice.workspace_id,
    invoice.amount,
  );

  const paymentIntentData: {
    metadata: Record<string, string>;
    application_fee_amount?: number;
  } = {
    metadata: {
      invoiceId: invoice.id,
      invoice_id: invoice.id,
      workspace_id: invoice.workspace_id,
      ...(invoice.stripe_customer_id
        ? { workspace_stripe_customer_id: invoice.stripe_customer_id }
        : {}),
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
        workspace_id: invoice.workspace_id,
        ...(invoice.stripe_customer_id
          ? { workspace_stripe_customer_id: invoice.stripe_customer_id }
          : {}),
      },
      payment_intent_data: paymentIntentData,
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    { stripeAccount: invoice.stripe_account_id },
  );

  return {
    checkoutSession,
    feeBreakdown: ownerStripeConfig.feeBreakdown,
  };
}
