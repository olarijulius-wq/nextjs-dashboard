'use client';

import { lusitana } from '@/app/ui/fonts';
import {
  AtSymbolIcon,
  KeyIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { Button } from '@/app/ui/button';
import { useActionState, useEffect, useRef, useState } from 'react';
import { authenticate } from '@/app/lib/actions';
import { useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const searchParams = useSearchParams();

  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const signupSuccess = searchParams.get('signup') === 'success';

  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitCount, setSubmitCount] = useState(0);
  const lastClearedSubmit = useRef(0);

  useEffect(() => {
    if (errorMessage && submitCount !== lastClearedSubmit.current) {
      lastClearedSubmit.current = submitCount;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassword('');
    }
  }, [errorMessage, submitCount]);

  const handleSubmit = () => {
    setSubmitCount((count) => count + 1);
  };

  return (
    <form action={formAction} className="space-y-3" onSubmit={handleSubmit}>
      <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 pb-4 pt-8 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">

        {/* ✅ SIGNUP SUCCESS MESSAGE */}
        {signupSuccess && (
          <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Account created successfully. Please log in.
          </div>
        )}

        <h1 className={`${lusitana.className} mb-3 text-2xl`}>
          Please log in to continue.
        </h1>

        <div className="w-full">
          {/* EMAIL */}
          <div>
            <label
              className="mb-3 mt-5 block text-xs font-medium text-slate-200"
              htmlFor="email"
            >
              Email
            </label>
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="Enter your email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="peer block w-full rounded-xl border border-slate-800 bg-slate-950/60 py-[9px] pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
              />
              <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-sky-300" />
            </div>
          </div>

          {/* PASSWORD */}
          <div className="mt-4">
            <label
              className="mb-3 mt-5 block text-xs font-medium text-slate-200"
              htmlFor="password"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="Enter password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="peer block w-full rounded-xl border border-slate-800 bg-slate-950/60 py-[9px] pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
              />
              <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-sky-300" />
            </div>
          </div>
        </div>

        {/* REDIRECT TARGET */}
        <input type="hidden" name="redirectTo" value={callbackUrl} />

        {/* SUBMIT */}
        <Button className="mt-4 w-full" aria-disabled={isPending}>
          Log in
          <ArrowRightIcon className="ml-auto h-5 w-5 text-white" />
        </Button>

        {/* ERROR MESSAGE */}
        <div
          className="flex h-8 items-end space-x-1"
          aria-live="polite"
          aria-atomic="true"
        >
          {errorMessage && (
            <>
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-500">{errorMessage}</p>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
