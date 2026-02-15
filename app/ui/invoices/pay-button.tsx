'use client';

import { useState } from 'react';
import clsx from 'clsx';

type PayInvoiceButtonProps = {
  invoiceId: string;
  disabled?: boolean;
  className?: string;
};

type StartPaymentResponse = {
  url?: string;
  error?: string;
  code?: string;
  message?: string;
  actionUrl?: string;
};

export default function PayInvoiceButton({
  invoiceId,
  disabled = false,
  className,
}: PayInvoiceButtonProps) {
  const payNowButtonClasses =
    'inline-flex items-center justify-center rounded-xl border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-emerald-700 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-emerald-400/40 dark:bg-black dark:text-emerald-300 dark:hover:bg-emerald-500/10 dark:focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60';
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionUrl, setActionUrl] = useState<string | null>(null);

  async function handleClick() {
    if (isLoading || disabled) return;
    setIsLoading(true);
    setErrorMessage(null);
    setActionUrl(null);

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pay`, {
        method: 'POST',
      });
      const data = (await response.json()) as StartPaymentResponse;

      if (!response.ok) {
        if (
          data.code === 'CONNECT_CARD_PAYMENTS_REQUIRED' &&
          data.actionUrl
        ) {
          setErrorMessage(
            data.message ??
              'Card payments are not enabled on your connected Stripe account.',
          );
          setActionUrl(data.actionUrl);
          setIsLoading(false);
          return;
        }
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
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={clsx(payNowButtonClasses, className)}
      >
        {isLoading ? 'Redirecting...' : 'Pay now'}
      </button>
      {errorMessage ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {errorMessage}
          </p>
          {actionUrl ? (
            <a
              href={actionUrl}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Finish Stripe setup
            </a>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
