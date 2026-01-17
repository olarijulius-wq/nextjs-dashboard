import { stripe } from '@/app/lib/stripe';

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

  return stripe.checkout.sessions.create({
    mode: 'payment',
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
      invoice_id: invoice.id,
      user_email: invoice.user_email,
    },
    payment_intent_data: {
      metadata: {
        invoice_id: invoice.id,
        user_email: invoice.user_email,
      },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}
