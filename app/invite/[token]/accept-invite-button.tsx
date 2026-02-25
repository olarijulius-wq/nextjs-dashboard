'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/ui/button';

type AcceptInviteButtonProps = {
  token: string;
};

export default function AcceptInviteButton({ token }: AcceptInviteButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function acceptInvite() {
    setStatus(null);

    startTransition(async () => {
      const response = await fetch(`/api/settings/team/invite/accept/${token}`, {
        method: 'POST',
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setStatus({
          ok: false,
          message: payload?.message ?? 'Failed to accept invite.',
        });
        return;
      }

      setStatus({
        ok: true,
        message: payload.message ?? 'Invite accepted.',
      });
      router.push('/dashboard/settings/team');
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={acceptInvite} disabled={isPending}>
        {isPending ? 'Accepting...' : 'Accept invite'}
      </Button>
      {status && (
        <p
          className={`text-sm ${status.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}
          aria-live="polite"
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
