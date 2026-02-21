'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { UserCircleIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { Button } from '@/app/ui/button';
import { createCustomer, CustomerState } from '@/app/lib/actions';
import inputStyles from './customer-inputs.module.css';

const neutralInputClasses = `${inputStyles.neutralInput} peer block w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 dark:border-neutral-800 dark:bg-black dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-neutral-500 dark:focus:ring-neutral-500/30`;

const neutralSecondaryButtonClasses =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition duration-200 ease-out hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-700 dark:bg-black dark:text-neutral-100 dark:hover:bg-neutral-900 dark:focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-black';

const neutralPrimaryButtonClasses =
  'border border-black bg-black text-white hover:bg-neutral-900 hover:scale-100 focus-visible:ring-neutral-400 dark:border-white dark:bg-white dark:text-black dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-500';

export default function Form({ returnTo }: { returnTo?: string }) {
  const initialState: CustomerState = { message: '', errors: {} };
  const [state, formAction] = useActionState(createCustomer, initialState);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <form action={formAction}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] md:p-6 dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        {/* Customer Name */}
        <div className="mb-4">
          <label
            htmlFor="name"
            className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200"
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
              className={neutralInputClasses}
              aria-describedby="name-error"
              required
            />
            <UserCircleIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-neutral-800 dark:peer-focus:text-neutral-200" />
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
            className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200"
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
              className={neutralInputClasses}
              aria-describedby="email-error"
              required
            />
            <EnvelopeIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-neutral-800 dark:peer-focus:text-neutral-200" />
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
          className={neutralSecondaryButtonClasses}
        >
          Cancel
        </Link>
        <Button type="submit" className={neutralPrimaryButtonClasses}>
          Create Customer
        </Button>
      </div>
    </form>
  );
}
