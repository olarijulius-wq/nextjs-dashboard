'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import Link from 'next/link';
import { Button } from '@/app/ui/button';
import { registerUser, SignupState } from '@/app/lib/actions';
import SocialAuthButtons from '@/app/(auth)/_components/social-auth-buttons';
import authInputStyles from '@/app/(auth)/_components/auth-inputs.module.css';

type SignupFormProps = {
  googleEnabled: boolean;
  githubEnabled: boolean;
  callbackUrl?: string | null;
};

export default function SignupForm({
  googleEnabled,
  githubEnabled,
  callbackUrl,
}: SignupFormProps) {
  const initialState: SignupState = { message: null, errors: {} };
  const [state, formAction] = useActionState(registerUser, initialState);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitCount, setSubmitCount] = useState(0);
  const lastClearedSubmit = useRef(0);
  const hasError = Boolean(
    state.message ||
      state.errors?.email?.length ||
      state.errors?.password?.length,
  );

  useEffect(() => {
    if (hasError && submitCount !== lastClearedSubmit.current) {
      lastClearedSubmit.current = submitCount;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassword('');
    }
  }, [hasError, submitCount]);

  const handleSubmit = () => {
    setSubmitCount((count) => count + 1);
  };

  return (
    <form action={formAction} className="space-y-5" onSubmit={handleSubmit}>
      <SocialAuthButtons
        googleEnabled={googleEnabled}
        githubEnabled={githubEnabled}
      />
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-zinc-300 dark:bg-white/10" />
        <span className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-white/50">
          or
        </span>
        <span className="h-px flex-1 bg-zinc-300 dark:bg-white/10" />
      </div>

      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ''} />

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-white/80">Email</label>
        <input
          name="email"
          type="email"
          className={`${authInputStyles.authInput} block w-full rounded-xl border border-zinc-300 bg-white px-3 py-[11px] text-sm text-zinc-900 outline-none placeholder:text-zinc-400 transition focus:border-zinc-500 focus:ring-2 focus:ring-emerald-500/25 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20 dark:focus:ring-emerald-500/30`}
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {state.errors?.email?.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-600 dark:text-red-400">{e}</p>
        ))}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-white/80">Password</label>
        <input
          name="password"
          type="password"
          className={`${authInputStyles.authInput} block w-full rounded-xl border border-zinc-300 bg-white px-3 py-[11px] text-sm text-zinc-900 outline-none placeholder:text-zinc-400 transition focus:border-zinc-500 focus:ring-2 focus:ring-emerald-500/25 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20 dark:focus:ring-emerald-500/30`}
          placeholder="At least 6 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {state.errors?.password?.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-600 dark:text-red-400">{e}</p>
        ))}
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm text-zinc-700 dark:text-white/80">
          <input
            name="termsAccepted"
            type="checkbox"
            required
            className="mt-1 h-4 w-4 rounded border border-zinc-400 bg-white text-zinc-900 focus:ring-2 focus:ring-emerald-500/35 dark:border-white/20 dark:bg-white/5 dark:text-white dark:focus:ring-emerald-500/40"
          />
          <span>
            I agree to the{' '}
            <Link href="/legal/terms" className="text-zinc-900 underline underline-offset-4 dark:text-white">
              Terms
            </Link>{' '}
            and acknowledge the{' '}
            <Link
              href="/legal/privacy"
              className="text-zinc-900 underline underline-offset-4 dark:text-white"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {state.errors?.termsAccepted?.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-600 dark:text-red-400">{e}</p>
        ))}
      </div>

      {state.message && <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>}

      <Button
        type="submit"
        className="h-11 w-full justify-start border-zinc-300 bg-white px-4 text-zinc-950 shadow-[0_10px_24px_rgba(0,0,0,0.12)] hover:border-zinc-400 hover:bg-white hover:shadow-[0_12px_26px_rgba(0,0,0,0.14)] focus-visible:ring-emerald-500/35 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:shadow-[0_10px_28px_rgba(0,0,0,0.35)] dark:hover:bg-zinc-800 dark:focus-visible:ring-emerald-500/40"
      >
        Create account
        <ArrowRightIcon className="ml-auto h-5 w-5 text-current" />
      </Button>
    </form>
  );
}
