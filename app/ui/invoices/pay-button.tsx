'use client';

import { useState } from 'react';

type PayInvoiceButtonProps = {
  invoiceId: string;
  className?: string;
};

export default function PayInvoiceButton({
  invoiceId,
  className,
}: PayInvoiceButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pay`, {
        method: 'POST',
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to start payment');
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error('Missing Stripe Checkout URL');
    } catch (error) {
      console.error('Pay now failed:', error);
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={
        className ??
        'rounded-md border border-emerald-500/40 px-3 py-2 text-sm text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      {isLoading ? 'Redirecting...' : 'Pay now'}
    </button>
  );
}
