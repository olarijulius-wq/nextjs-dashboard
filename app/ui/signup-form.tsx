'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/app/ui/button';
import { registerUser, SignupState } from '@/app/lib/actions';

export default function SignupForm() {
  const initialState: SignupState = { message: null, errors: {} };
  const [state, formAction] = useActionState(registerUser, initialState);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitCount, setSubmitCount] = useState(0);
  const lastClearedSubmit = useRef(0);
  const hasError = Boolean(
    state.message ||
      state.errors?.name?.length ||
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
    <form action={formAction} className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Name
        </label>
        <input
          name="name"
          type="text"
          className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {state.errors?.name?.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-500">{e}</p>
        ))}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Email
        </label>
        <input
          name="email"
          type="email"
          className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {state.errors?.email?.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-500">{e}</p>
        ))}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">
          Password
        </label>
        <input
          name="password"
          type="password"
          className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {state.errors?.password?.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-500">{e}</p>
        ))}
      </div>

      {state.message && (
        <p className="text-sm text-red-500">{state.message}</p>
      )}

      <Button type="submit" className="w-full">
        Create account
      </Button>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link href="/login" className="text-sky-300 hover:text-sky-200">
          Log in
        </Link>
      </p>
    </form>
  );
}
