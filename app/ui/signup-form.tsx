'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { Button } from '@/app/ui/button';
import { registerUser, SignupState } from '@/app/lib/actions';
import SocialAuthButtons from '@/app/(auth)/_components/social-auth-buttons';

export default function SignupForm() {
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
      <SocialAuthButtons />
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs uppercase tracking-[0.16em] text-white/50">
          or
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <input type="hidden" name="name" value="Lateless User" />

      <div>
        <label className="mb-2 block text-sm font-medium text-white/80">Email</label>
        <input
          name="email"
          type="email"
          className="block w-full rounded-xl border border-white/[0.12] bg-white/[0.06] px-3 py-[11px] text-sm text-white outline-none placeholder:text-white/35 transition focus:border-white/20 focus:ring-2 focus:ring-white/20"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {state.errors?.email?.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-400">{e}</p>
        ))}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-white/80">Password</label>
        <input
          name="password"
          type="password"
          className="block w-full rounded-xl border border-white/[0.12] bg-white/[0.06] px-3 py-[11px] text-sm text-white outline-none placeholder:text-white/35 transition focus:border-white/20 focus:ring-2 focus:ring-white/20"
          placeholder="At least 6 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {state.errors?.password?.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-400">{e}</p>
        ))}
      </div>

      {state.message && <p className="text-sm text-red-400">{state.message}</p>}

      <Button
        type="submit"
        className="h-11 w-full justify-start border-white bg-white px-4 text-black shadow-[0_10px_28px_rgba(0,0,0,0.35)] hover:bg-white/90"
      >
        Create account
        <ArrowRightIcon className="ml-auto h-5 w-5 text-current" />
      </Button>
    </form>
  );
}
