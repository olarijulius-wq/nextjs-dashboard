'use client';

import { useState } from 'react';
import { primaryButtonClasses } from '@/app/ui/button';

type ResendVerificationButtonProps = {
  email: string;
};

export default function ResendVerificationButton({ email }: ResendVerificationButtonProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleResend() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch('/api/account/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to resend.');
      }

      setMessage('Verification email sent.');
    } catch {
      setMessage('Could not resend verification email.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleResend}
        disabled={pending}
        className={primaryButtonClasses}
      >
        {pending ? 'Sending...' : 'Resend verification email'}
      </button>
      {message ? (
        <p className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
