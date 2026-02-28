'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { primaryButtonClasses, secondaryButtonClasses } from '@/app/ui/button';

type SendInvoiceButtonProps = {
  invoiceId: string;
  returnTo?: string;
  compact?: boolean;
  onSent?: (input: { invoiceId: string; sentAt: string }) => void;
  initialStatus?: string | null;
  initialSentAt?: string | null;
  initialError?: string | null;
  redirectToReturnTo?: boolean;
};

type SendInvoiceResponse = {
  ok?: boolean;
  sentAt?: string;
  error?: string;
  code?: string;
  actionUrl?: string;
  actionHint?: string;
};

function formatSentAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function SendInvoiceButton({
  invoiceId,
  returnTo,
  compact = false,
  onSent,
  initialStatus,
  initialSentAt,
  initialError,
  redirectToReturnTo = false,
}: SendInvoiceButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(initialStatus ?? null);
  const [sentAt, setSentAt] = useState<string | null>(initialSentAt ?? null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [actionUrl, setActionUrl] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sentLabel = useMemo(() => formatSentAt(sentAt), [sentAt]);

  function stopRowNavigation(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function handleSend(event?: MouseEvent<HTMLElement>) {
    if (event) {
      stopRowNavigation(event);
    }
    if (isSending) return;
    setIsSending(true);
    setError(null);
    setActionUrl(null);

    const url = new URL(`/api/invoices/${invoiceId}/send`, window.location.origin);
    if (returnTo) url.searchParams.set('returnTo', returnTo);

    try {
      const response = await fetch(url.toString(), { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as SendInvoiceResponse | null;

      if (!response.ok || !payload?.ok) {
        const fallbackError =
          response.status === 403
            ? 'You do not have permission to send invoice emails in this workspace.'
            : response.status === 401
              ? 'You need to sign in again to send invoice emails.'
              : response.status >= 500
                ? 'Invoice email failed to send. Check SMTP settings and try again.'
                : 'Failed to send invoice email.';
        setStatus('failed');
        setError(payload?.error ?? payload?.actionHint ?? fallbackError);
        setActionUrl(payload?.actionUrl ?? null);
        return;
      }

      const nextSentAt = payload.sentAt ?? new Date().toISOString();
      setStatus('sent');
      setSentAt(nextSentAt);
      setError(null);
      router.refresh();
      if (onSent) {
        onSent({ invoiceId, sentAt: nextSentAt });
      }
      if (redirectToReturnTo && returnTo) {
        const nextUrl = new URL(returnTo, window.location.origin);
        nextUrl.searchParams.set('updated', '1');
        nextUrl.searchParams.set('updatedInvoice', invoiceId);
        nextUrl.searchParams.set('highlight', invoiceId);
        router.push(`${nextUrl.pathname}?${nextUrl.searchParams.toString()}`);
      }
    } catch {
      setStatus('failed');
      setError('Network error while sending invoice email.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <button
        type="button"
        onClick={(event) => {
          void handleSend(event);
        }}
        disabled={isSending}
        data-row-nav-stop
        className={compact ? `${primaryButtonClasses} pointer-events-auto relative z-10 h-9 w-24 justify-center whitespace-nowrap px-2 text-center text-xs md:w-auto` : `${primaryButtonClasses} pointer-events-auto relative z-10 h-9 px-3`}
      >
        {isSending
          ? 'Sending…'
          : status === 'sent'
            ? 'Sent'
            : status === 'failed'
              ? 'Retry'
              : 'Send'}
      </button>

      {status === 'sent' && sentLabel ? (
        compact ? (
          <>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 md:hidden">Sent {sentLabel}</p>
            <p className="hidden text-xs text-emerald-700 dark:text-emerald-300 md:block">Sent {sentLabel}</p>
          </>
        ) : (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">Sent {sentLabel}</p>
        )
      ) : null}

      {error ? (
        <div className="space-y-2">
          <p className="text-xs text-red-600 dark:text-red-300">{error}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                void handleSend(event);
              }}
              data-row-nav-stop
              className={`${secondaryButtonClasses} pointer-events-auto relative z-10 h-8 px-2 text-xs`}
            >
              Retry
            </button>
            {actionUrl ? (
              <a
                href={actionUrl}
                data-row-nav-stop
                className={`${secondaryButtonClasses} pointer-events-auto relative z-10 h-8 px-2 text-xs`}
              >
                Fix customer
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
