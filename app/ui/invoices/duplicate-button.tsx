'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/app/ui/button';
import { duplicateInvoice, type DuplicateInvoiceState } from '@/app/lib/actions';

export default function DuplicateInvoiceButton({ id }: { id: string }) {
  const initialState: DuplicateInvoiceState | null = null;
  const duplicateInvoiceWithId = duplicateInvoice.bind(null, id);
  const [state, formAction, isPending] = useActionState(
    duplicateInvoiceWithId,
    initialState,
  );

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={formAction}>
        <Button type="submit" aria-disabled={isPending}>
          Duplicate
        </Button>
      </form>

      {state?.ok === false && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-amber-100">
          <p className="text-sm">{state.message}</p>
          {state.code === 'LIMIT_REACHED' && (
            <Link
              className="mt-2 inline-flex items-center rounded-xl border border-amber-300/40 px-3 py-2 text-sm font-medium text-amber-100 transition duration-200 ease-out hover:bg-amber-500/10 hover:scale-[1.01]"
              href="/dashboard/settings"
            >
              Upgrade to Pro
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
