'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PaidInvoiceRefresh() {
  const router = useRouter();

  useEffect(() => {
    const first = window.setTimeout(() => router.refresh(), 1200);
    const second = window.setTimeout(() => router.refresh(), 3000);

    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [router]);

  return null;
}
