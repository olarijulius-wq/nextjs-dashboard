'use client';

import { useState } from 'react';
import { Button } from '@/app/ui/button';

type ConnectStripeButtonProps = {
  label?: string;
  path?: string;
  className?: string;
};

export default function ConnectStripeButton({
  label = 'Connect Stripe',
  path = '/api/stripe/connect/onboard',
  className = 'w-full',
}: ConnectStripeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorBuild, setErrorBuild] = useState<string | null>(null);

  async function startOnboarding() {
    setLoading(true);
    setError(null);
    setErrorBuild(null);

    try {
      const res = await fetch(path, { method: 'POST' });
      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        const message =
          data?.message ??
          data?.error ??
          (typeof data === 'string' ? data : JSON.stringify(data)) ??
          'Failed to start onboarding.';
        setErrorBuild(typeof data?.build === 'string' ? data.build : null);
        throw new Error(message);
      }

      if (!data?.url) {
        throw new Error('Missing onboarding URL.');
      }

      window.location.href = data.url;
    } catch (err: any) {
      setLoading(false);
      setError(err?.message ?? 'Something went wrong.');
    }
  }

  return (
    <div className="w-full">
      <Button
        type="button"
        onClick={startOnboarding}
        aria-disabled={loading}
        className={className}
      >
        {loading ? 'Redirecting to Stripe...' : label}
      </Button>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      {errorBuild && (
        <details className="mt-2 text-xs text-neutral-500">
          <summary>Details</summary>
          <p>Build: {errorBuild}</p>
        </details>
      )}
    </div>
  );
}
