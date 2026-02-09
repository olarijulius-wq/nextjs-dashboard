'use client';

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
import SocialAuthButtons from '@/app/(auth)/_components/social-auth-buttons';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="h-11 w-full justify-start border-white bg-white px-4 text-black shadow-[0_10px_28px_rgba(0,0,0,0.35)] hover:bg-white/90"
      aria-disabled={pending}
    >
      Log in
      <ArrowRightIcon className="ml-auto h-5 w-5 text-current" />
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
  const twoFactorInfoMessage =
    activeTwoFactorState.message ===
    'We have sent a 6-digit login code to your email.';

  if (state.needsTwoFactor || twoFactorState.needsTwoFactor) {
    return (
      <form action={twoFactorFormAction} className="space-y-5">
        <p className="text-sm text-white/70">
          We sent a 6-digit code to{' '}
          <span className="font-medium text-white">
            {activeTwoFactorState.emailForTwoFactor || email}
          </span>
          .
        </p>

        <label
          className="block text-xs font-medium text-white/80"
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
          className="block w-full rounded-xl border border-white/[0.12] bg-white/[0.06] py-3 text-center text-lg tracking-[0.24em] tabular-nums text-white outline-none placeholder:text-white/35 transition focus:border-white/20 focus:ring-2 focus:ring-white/20"
          placeholder="000000"
        />

        {activeTwoFactorState.message && (
          <p
            className={
              twoFactorInfoMessage
                ? 'rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-sm text-white/70'
                : 'text-sm text-red-400'
            }
            aria-live="polite"
          >
            {activeTwoFactorState.message}
          </p>
        )}

        <input type="hidden" name="redirectTo" defaultValue={callbackUrl} />

        <Button className="h-11 w-full border-white bg-white text-black shadow-[0_10px_28px_rgba(0,0,0,0.35)] hover:bg-white/90" type="submit">
          Verify code
          <ArrowRightIcon className="ml-auto h-5 w-5 text-current" />
        </Button>

        <div className="text-center">
          <Link href="/login" className="text-xs text-white/60 hover:text-white">
            Start over
          </Link>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-5" onSubmit={handleSubmit}>
      <SocialAuthButtons />
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs uppercase tracking-[0.16em] text-white/50">
          or
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      {state.message && (
        <div
          className="flex items-start space-x-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2"
          aria-live="polite"
          aria-atomic="true"
        >
          <ExclamationCircleIcon className="mt-0.5 h-5 w-5 text-red-400" />
          <p className="text-sm text-red-300">{state.message}</p>
        </div>
      )}

      <div>
        <label
          className="mb-2 block text-xs font-medium text-white/80"
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
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="peer block w-full rounded-xl border border-white/[0.12] bg-white/[0.06] py-[11px] pl-10 text-sm text-white outline-none placeholder:text-white/35 transition focus:border-white/20 focus:ring-2 focus:ring-white/20"
          />
          <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/40 transition peer-focus:text-white/70" />
        </div>
      </div>

      <div>
        <label
          className="mb-2 block text-xs font-medium text-white/80"
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
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="peer block w-full rounded-xl border border-white/[0.12] bg-white/[0.06] py-[11px] pl-10 text-sm text-white outline-none placeholder:text-white/35 transition focus:border-white/20 focus:ring-2 focus:ring-white/20"
          />
          <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/40 transition peer-focus:text-white/70" />
        </div>
        <div className="mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-xs text-white/60 hover:text-white"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <input type="hidden" name="redirectTo" defaultValue={callbackUrl} />

      <SubmitButton />

      {state.needsVerification && (
        <div className="space-y-1 text-sm">
          <button
            type="button"
            onClick={handleResend}
            className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-xs text-white/80 transition hover:border-white/20 hover:text-white"
          >
            Send verification email
          </button>
          {resent && (
            <p className="text-xs text-white/70">
              Verification email sent. Check your inbox and spam folder.
            </p>
          )}
          {resendError && <p className="text-xs text-red-400">{resendError}</p>}
        </div>
      )}
    </form>
  );
}
