'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type BillingSyncToastProps = {
  enabled: boolean;
  sessionId: string | null;
};

type SyncState = 'idle' | 'synced' | 'failed';
type SyncFailure = {
  code: string | null;
  message: string | null;
  debug: unknown;
};

type ReconcilePayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  effective?: boolean;
  wrote?: unknown;
  readback?: unknown;
  workspaceId?: string;
  userId?: string;
  plan?: string;
};

export default function BillingSyncToast({ enabled, sessionId }: BillingSyncToastProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<SyncState>('idle');
  const [failure, setFailure] = useState<SyncFailure | null>(null);

  const shouldRun = enabled && typeof sessionId === 'string' && sessionId.length > 0;

  useEffect(() => {
    if (!shouldRun || state !== 'idle') {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch('/api/stripe/reconcile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const payload = (await res.json()) as ReconcilePayload;
        if (cancelled) return;

        if (res.ok && payload?.ok && payload.effective !== false) {
          setState('synced');
          router.refresh();
          return;
        }

        const noEffect = payload?.ok && payload?.effective === false;
        const code = noEffect ? 'PLAN_SYNC_NO_EFFECT' : (payload?.code ?? null);
        const message = noEffect
          ? 'Sync failed: no DB rows updated (PLAN_SYNC_NO_EFFECT)'
          : (payload?.message ?? null);

        setFailure({
          code,
          message,
          debug: {
            workspaceId: payload?.workspaceId ?? null,
            userId: payload?.userId ?? null,
            plan: payload?.plan ?? null,
            wrote: payload?.wrote ?? null,
            readback: payload?.readback ?? null,
          },
        });
        setState('failed');
      } catch {
        if (!cancelled) {
          setFailure({
            code: null,
            message: 'Payment confirmed. Plan sync pending.',
            debug: null,
          });
          setState('failed');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, sessionId, shouldRun, state]);

  useEffect(() => {
    if (state !== 'synced' && state !== 'failed') {
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete('success');
      params.delete('session_id');
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [pathname, router, state]);

  const message = useMemo(() => {
    if (state === 'synced') return 'Plan synced.';
    if (state === 'failed') {
      if (failure?.code || failure?.message) {
        return [failure.code, failure.message].filter(Boolean).join(': ');
      }
      return 'Payment confirmed. Plan sync pending.';
    }
    return null;
  }, [failure, state]);

  if (!message || !enabled) return null;

  return (
    <div className="fixed right-4 top-4 z-50 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-[0_14px_28px_rgba(15,23,42,0.14)] dark:border-neutral-700 dark:bg-black dark:text-zinc-100">
      <p>{message}</p>
      {state === 'failed' && failure?.debug ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer">Debug details</summary>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-100 p-2 text-[11px] dark:bg-neutral-900">
            {JSON.stringify(failure.debug, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
