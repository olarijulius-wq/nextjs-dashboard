'use client';

import { useState } from 'react';
import { type PlanId } from '@/app/lib/config';

type UpgradeButtonProps = {
  plan: Exclude<PlanId, 'free'>;
  label: string;
  className?: string;
  disabled?: boolean;
};

export default function UpgradeButton({
  plan,
  label,
  className,
  disabled,
}: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    if (disabled) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/stripe/checkout?plan=${plan}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || 'Checkout failed');
      if (!data?.url) throw new Error('Missing checkout URL');

      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <button
      onClick={startCheckout}
      disabled={loading || disabled}
      className={
        className ??
        'rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50'
      }
    >
      {loading ? 'Redirecting...' : label}
    </button>
  );
}
