'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/app/ui/button';
import { type ResetPasswordState, resetPassword } from '@/app/lib/actions';

type ResetPasswordFormProps = {
  token: string;
};

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const initialState: ResetPasswordState = { message: null };
  const [state, formAction] = useActionState(
    resetPassword,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={6}
          required
          className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-slate-600 focus:ring-2 focus:ring-slate-600/50"
          placeholder="At least 6 characters"
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          minLength={6}
          required
          className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-slate-600 focus:ring-2 focus:ring-slate-600/50"
          placeholder="Repeat your new password"
        />
      </div>

      {state.message && <p className="text-sm text-red-400">{state.message}</p>}

      <Button type="submit" className="w-full">
        Set new password
      </Button>

      <p className="text-center text-sm text-slate-400">
        <Link href="/login" className="text-slate-200 hover:text-slate-300">
          Back to login
        </Link>
      </p>
    </form>
  );
}
