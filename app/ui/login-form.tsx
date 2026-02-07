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
import { useFormStatus } from 'react-dom';
import { authenticate, verifyTwoFactorCode } from '@/app/lib/actions';
import { initialLoginState } from '@/app/lib/login-state';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="mt-4 w-full" aria-disabled={pending}>
      Log in
      <ArrowRightIcon className="ml-auto h-5 w-5 text-white" />
    </Button>
  );
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [state, formAction] = useActionState(
    authenticate,
    initialLoginState,
  );
  const [twoFactorState, twoFactorFormAction] = useActionState(
    verifyTwoFactorCode,
    initialLoginState,
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitCount, setSubmitCount] = useState(0);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const lastClearedSubmit = useRef(0);

  useEffect(() => {
    if (state.message && submitCount !== lastClearedSubmit.current) {
      lastClearedSubmit.current = submitCount;
      setPassword('');
    }
  }, [state.message, submitCount]);

  useEffect(() => {
    if (state.success) {
      router.push(callbackUrl);
    }
  }, [callbackUrl, router, state.success]);

  useEffect(() => {
    if (twoFactorState.success) {
      router.push(callbackUrl);
    }
  }, [callbackUrl, router, twoFactorState.success]);

  const handleSubmit = () => {
    setSubmitCount((count) => count + 1);
    setResent(false);
    setResendError(null);
  };

  async function handleResend() {
    setResent(false);
    setResendError(null);

    const targetEmail = state.emailForVerification ?? email;
    if (!targetEmail) {
      setResendError('Could not resend verification email. Please try again.');
      return;
    }

    try {
      const response = await fetch('/api/account/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      if (!response.ok) {
        throw new Error('Failed to resend verification email');
      }
      setResent(true);
    } catch (error) {
      console.error(error);
      setResendError('Could not resend verification email. Please try again.');
    }
  }

  const activeTwoFactorState = twoFactorState.needsTwoFactor
    ? twoFactorState
    : state;

  if (state.needsTwoFactor || twoFactorState.needsTwoFactor) {
    return (
      <form action={twoFactorFormAction} className="space-y-3">
        <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 pb-4 pt-8 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <h1 className={`${lusitana.className} mb-3 text-2xl`}>
            Enter your login code.
          </h1>
          <p className="mb-4 text-sm text-slate-300">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-slate-100">
              {activeTwoFactorState.emailForTwoFactor || email}
            </span>
            .
          </p>

          <label
            className="mb-3 block text-xs font-medium text-slate-200"
            htmlFor="twoFactorCode"
          >
            6-digit code
          </label>
          <input
            id="twoFactorCode"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 py-3 text-center text-lg tracking-[0.24em] tabular-nums text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-slate-600 focus:ring-2 focus:ring-slate-600/50"
            placeholder="000000"
          />

          {activeTwoFactorState.message && (
            <p className="mt-3 text-sm text-red-500" aria-live="polite">
              {activeTwoFactorState.message}
            </p>
          )}

          <input type="hidden" name="redirectTo" defaultValue={callbackUrl} />

          <Button className="mt-4 w-full" type="submit">
            Verify code
          </Button>

          <div className="mt-3 text-center">
            <Link href="/login" className="text-xs text-slate-300 hover:text-slate-100">
              Start over
            </Link>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-3" onSubmit={handleSubmit}>
      <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 pb-4 pt-8 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">

        <h1 className={`${lusitana.className} mb-3 text-2xl`}>
          Please log in to continue.
        </h1>
        {state.message && (
          <div className="mb-4 flex items-start space-x-2" aria-live="polite" aria-atomic="true">
            <ExclamationCircleIcon className="mt-0.5 h-5 w-5 text-red-500" />
            <p className="text-sm text-red-500">{state.message}</p>
          </div>
        )}

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
                className="peer block w-full rounded-xl border border-slate-800 bg-slate-950/60 py-[9px] pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-slate-600 focus:ring-2 focus:ring-slate-600/50"
              />
              <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-slate-300" />
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
                className="peer block w-full rounded-xl border border-slate-800 bg-slate-950/60 py-[9px] pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-slate-600 focus:ring-2 focus:ring-slate-600/50"
              />
              <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-slate-300" />
            </div>
            <div className="mt-2 text-right">
              <Link
                href="/forgot-password"
                className="text-xs text-slate-300 hover:text-slate-100"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>

        {/* REDIRECT TARGET */}
        <input
          type="hidden"
          name="redirectTo"
          defaultValue={callbackUrl}
        />

        {/* SUBMIT */}
        <SubmitButton />

        {state.needsVerification && (
          <div className="mt-2 space-y-1 text-sm">
            <button
              type="button"
              onClick={handleResend}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-100 hover:border-slate-500 hover:bg-slate-900"
            >
              Send verification email
            </button>
            {resent && (
              <p className="text-xs text-slate-400">
                Verification email sent. Check your inbox and spam folder.
              </p>
            )}
            {resendError && (
              <p className="text-xs text-red-400">{resendError}</p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
