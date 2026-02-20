'use client';

import { useState } from 'react';
import { secondaryButtonClasses } from '@/app/ui/button';

export default function SendRecoveryEmailButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendRecoveryEmail() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch('/api/billing/recovery-email', { method: 'POST' });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; sent?: boolean; skipped?: boolean; reason?: string; error?: string }
        | null;

      if (!res.ok) {
        throw new Error(payload?.error ?? 'Failed to send billing recovery email.');
      }

      if (payload?.sent) {
        setMessage('Recovery email sent.');
      } else if (payload?.skipped) {
        setMessage('Recovery email skipped (already sent in the last 24h).');
      } else {
        setMessage('No recovery email was sent.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send billing recovery email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={sendRecoveryEmail}
        disabled={loading}
        className={`${secondaryButtonClasses} h-9 px-3 text-xs`}
      >
        {loading ? 'Sending...' : 'Send recovery email'}
      </button>
      {message ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p> : null}
      {error ? <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}
