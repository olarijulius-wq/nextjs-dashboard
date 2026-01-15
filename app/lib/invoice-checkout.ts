import { stripe } from '@/app/lib/stripe';

export type InvoiceCheckoutInput = {
  id: string;
  amount: number;
  invoice_number: string | null;
  customer_email: string | null;
  user_email: string;
};

export async function createInvoiceCheckoutSession(
  invoice: InvoiceCheckoutInput,
  baseUrl: string,
) {
  const invoiceLabel =
    invoice.invoice_number ?? `#${invoice.id.slice(0, 8)}`;

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
    success_url: `${baseUrl}/dashboard/invoices/${invoice.id}?paid=1`,
    cancel_url: `${baseUrl}/dashboard/invoices/${invoice.id}?canceled=1`,
  });
}
