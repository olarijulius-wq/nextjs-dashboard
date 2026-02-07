'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  type PasswordResetRequestState,
  requestPasswordReset,
} from '@/app/lib/actions';
import { Button } from '@/app/ui/button';

export default function ForgotPasswordForm() {
  const initialState: PasswordResetRequestState = { message: null };
  const [state, formAction] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-slate-600 focus:ring-2 focus:ring-slate-600/50"
          placeholder="you@example.com"
        />
      </div>

      {state.message && <p className="text-sm text-slate-300">{state.message}</p>}

      <Button type="submit" className="w-full">
        Send reset link
      </Button>

      <p className="text-center text-sm text-slate-400">
        Remembered it?{' '}
        <Link href="/login" className="text-slate-200 hover:text-slate-300">
          Back to login
        </Link>
      </p>
    </form>
  );
}
