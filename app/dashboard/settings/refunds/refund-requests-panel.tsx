'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { secondaryButtonClasses } from '@/app/ui/button';
import { formatCurrency } from '@/app/lib/utils';

type RefundRequestItem = {
  id: string;
  createdAt: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amount: number;
  currency: string;
  payerEmail: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  resolvedAt: string | null;
  resolvedByUserEmail: string | null;
  stripeRefundId: string | null;
};

type ApiResponse =
  | { ok: true; requests: RefundRequestItem[] }
  | { ok: false; message?: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(status: RefundRequestItem['status']) {
  if (status === 'approved') return 'Approved';
  if (status === 'declined') return 'Declined';
  return 'Pending';
}

export default function RefundRequestsPanel() {
  const router = useRouter();
  const [requests, setRequests] = useState<RefundRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const response = await fetch('/api/dashboard/refund-requests', {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!mounted) return;

      if (!response.ok || !payload?.ok) {
        const errorMessage =
          payload && 'message' in payload ? payload.message : undefined;
        setMessage({
          ok: false,
          text: errorMessage ?? 'Failed to load refund requests.',
        });
        setLoading(false);
        return;
      }

      setRequests(payload.requests);
      setLoading(false);
    }

    load().catch(() => {
      if (!mounted) return;
      setMessage({ ok: false, text: 'Failed to load refund requests.' });
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === 'pending').length,
    [requests],
  );

  function updateRequestStatus(
    id: string,
    status: RefundRequestItem['status'],
    stripeRefundId?: string | null,
  ) {
    setRequests((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              resolvedAt: new Date().toISOString(),
              stripeRefundId: stripeRefundId ?? item.stripeRefundId,
            }
          : item,
      ),
    );
  }

  function runAction(id: string, action: 'approve' | 'decline') {
    if (pendingId || isPending) return;
    if (action === 'approve' && !window.confirm('Approve and create Stripe refund?')) {
      return;
    }

    setMessage(null);
    setPendingId(id);

    startTransition(async () => {
      const response = await fetch(`/api/dashboard/refund-requests/${id}/${action}`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; stripeRefundId?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage({
          ok: false,
          text:
            payload?.message ??
            `Failed to ${action === 'approve' ? 'approve' : 'decline'} refund request.`,
        });
        setPendingId(null);
        return;
      }

      updateRequestStatus(
        id,
        action === 'approve' ? 'approved' : 'declined',
        payload.stripeRefundId ?? null,
      );
      setMessage({
        ok: true,
        text: action === 'approve' ? 'Refund approved.' : 'Refund declined.',
      });
      setPendingId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Refund requests
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pending: {pendingCount}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading refund requests...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">No refund requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Payer email</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => {
                const invoiceLabel = item.invoiceNumber ?? `#${item.invoiceId.slice(0, 8)}`;
                const amountLabel = formatCurrency(item.amount, item.currency);
                const actionDisabled = isPending || pendingId === item.id || item.status !== 'pending';

                return (
                  <tr
                    key={item.id}
                    className="border-t border-neutral-200/70 text-slate-700 dark:border-neutral-800 dark:text-slate-300"
                  >
                    <td className="px-3 py-2">{formatDate(item.createdAt)}</td>
                    <td className="px-3 py-2">{invoiceLabel}</td>
                    <td className="px-3 py-2">{amountLabel}</td>
                    <td className="px-3 py-2">{item.payerEmail ?? '—'}</td>
                    <td className="max-w-xs px-3 py-2">
                      <p className="line-clamp-3">{item.reason}</p>
                    </td>
                    <td className="px-3 py-2">{statusLabel(item.status)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => runAction(item.id, 'approve')}
                          disabled={actionDisabled}
                          className="rounded-xl border border-black bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-black"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => runAction(item.id, 'decline')}
                          disabled={actionDisabled}
                          className={secondaryButtonClasses}
                        >
                          Decline
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {message && (
        <p
          className={`text-sm ${message.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
          aria-live="polite"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
