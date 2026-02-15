'use client';

import { useState } from 'react';
import { DARK_INPUT, DARK_SURFACE } from '@/app/ui/theme/tokens';

type PublicRefundRequestProps = {
  token: string;
  hasPendingRequest: boolean;
};

type SubmitState = 'idle' | 'submitting' | 'success';

export default function PublicRefundRequest({
  token,
  hasPendingRequest,
}: PublicRefundRequestProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [payerEmail, setPayerEmail] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [pendingExists, setPendingExists] = useState(hasPendingRequest);

  if (submitState === 'success') {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-300" aria-live="polite">
        Request sent to seller. You&apos;ll get a reply by email.
      </p>
    );
  }

  if (pendingExists) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-300" aria-live="polite">
        A refund request is already pending.
      </p>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === 'submitting') return;

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      setMessage('Please provide at least 10 characters.');
      return;
    }

    setMessage(null);
    setSubmitState('submitting');

    try {
      const response = await fetch(`/api/public/invoices/${token}/refund-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payer_email: payerEmail.trim() || null,
          reason: trimmedReason,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (response.status === 409) {
        setPendingExists(true);
        setSubmitState('idle');
        return;
      }

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message ?? 'Failed to submit refund request.');
        setSubmitState('idle');
        return;
      }

      setSubmitState('success');
    } catch {
      setMessage('Failed to submit refund request.');
      setSubmitState('idle');
    }
  }

  return (
    <div className={`w-full rounded-xl border border-neutral-200 bg-white p-4 ${DARK_SURFACE}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-700 dark:text-zinc-300">
          Need a refund for this payment?
        </p>
        <button
          type="button"
          onClick={() => {
            setIsOpen((current) => !current);
            setMessage(null);
          }}
          className="inline-flex items-center justify-center rounded-xl border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-emerald-700 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-emerald-400/40 dark:bg-black dark:text-emerald-300 dark:hover:bg-emerald-500/10 dark:focus-visible:ring-offset-black"
        >
          Request refund
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-neutral-200 pt-4 dark:border-zinc-800">
          <label className="block text-xs uppercase tracking-wide text-neutral-500 dark:text-zinc-400">
            Your email (optional)
            <input
              type="email"
              value={payerEmail}
              onChange={(event) => setPayerEmail(event.target.value)}
              className={`mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${DARK_INPUT}`}
              placeholder="you@example.com"
              maxLength={320}
            />
          </label>

          <label className="block text-xs uppercase tracking-wide text-neutral-500 dark:text-zinc-400">
            Reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={`mt-1 min-h-24 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${DARK_INPUT}`}
              placeholder="Please describe what happened..."
              minLength={10}
              required
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 dark:border-zinc-700 dark:bg-black dark:text-zinc-200"
              disabled={submitState === 'submitting'}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitState === 'submitting'}
              className="rounded-lg border border-neutral-400 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 disabled:opacity-60 dark:border-zinc-600 dark:bg-black dark:text-zinc-100"
            >
              {submitState === 'submitting' ? 'Sending...' : 'Submit request'}
            </button>
          </div>

          {message && (
            <p className="text-sm text-rose-700 dark:text-rose-300" aria-live="polite">
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
