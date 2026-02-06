'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { UserCircleIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { Button } from '@/app/ui/button';
import { createCustomer, CustomerState } from '@/app/lib/actions';

export default function Form() {
  const initialState: CustomerState = { message: '', errors: {} };
  const [state, formAction] = useActionState(createCustomer, initialState);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <form action={formAction}>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:p-6">
        {/* Customer Name */}
        <div className="mb-4">
          <label
            htmlFor="name"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Customer name
          </label>
          <div className="relative">
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Enter customer name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="peer block w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
              aria-describedby="name-error"
              required
            />
            <UserCircleIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-sky-300" />
          </div>
          <div id="name-error" aria-live="polite" aria-atomic="true">
            {state.errors?.name?.map((error: string) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        {/* Customer Email */}
        <div className="mb-0">
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-medium text-slate-200"
          >
            Email
          </label>
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="peer block w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
              aria-describedby="email-error"
              required
            />
            <EnvelopeIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-sky-300" />
          </div>
          <div id="email-error" aria-live="polite" aria-atomic="true">
            {state.errors?.email?.map((error: string) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        {state.message && (
          <p className="mt-4 text-sm text-red-500" aria-live="polite">
            {state.message}
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-4">
        <Link
          href="/dashboard/customers"
          className="flex h-10 items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 text-sm font-medium text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01]"
        >
          Cancel
        </Link>
        <Button type="submit">Create Customer</Button>
      </div>
    </form>
  );
}
