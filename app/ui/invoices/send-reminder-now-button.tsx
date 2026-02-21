'use client';

import { useState } from 'react';
import { secondaryButtonClasses } from '@/app/ui/button';
import { useRouter } from 'next/navigation';

type ReminderResponse = {
  ok?: boolean;
  error?: string;
};

export default function SendReminderNowButton() {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSendReminder() {
    if (isSending) return;
    setIsSending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/reminders/run-manual', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as ReminderResponse | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? 'Failed to send reminder.');
        return;
      }
      setMessage('Reminder run started.');
      router.refresh();
    } catch {
      setError('Failed to send reminder.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleSendReminder}
        disabled={isSending}
        className={`${secondaryButtonClasses} h-9 px-3`}
      >
        {isSending ? 'Sending…' : 'Send reminder now'}
      </button>
      {message ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p> : null}
      {error ? <p className="text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
