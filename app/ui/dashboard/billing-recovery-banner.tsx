'use client';

import { useState } from 'react';
import { secondaryButtonClasses } from '@/app/ui/button';

export default function BillingRecoveryBanner() {
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!isVisible) {
    return null;
  }

  async function openPortal() {
    setIsOpeningPortal(true);
    setError(null);

    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? 'Failed to open billing portal.');
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal.');
      setIsOpeningPortal(false);
    }
  }

  async function dismissBanner() {
    setIsDismissing(true);
    setError(null);

    try {
      const res = await fetch('/api/billing/dismiss-banner', { method: 'POST' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to dismiss banner.');
      }
      setIsVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss banner.');
      setIsDismissing(false);
    }
  }

  return (
    <section className="sticky top-0 z-40 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-medium">
          Payment issue: your subscription needs attention to keep sending invoices/reminders.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPortal}
            disabled={isOpeningPortal || isDismissing}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-950 bg-amber-950 px-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-200 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
          >
            {isOpeningPortal ? 'Opening...' : 'Fix payment'}
          </button>
          <button
            type="button"
            onClick={dismissBanner}
            disabled={isOpeningPortal || isDismissing}
            className={`${secondaryButtonClasses} h-9 px-3 text-xs`}
          >
            {isDismissing ? 'Dismissing...' : 'Dismiss'}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error}</p> : null}
    </section>
  );
}
