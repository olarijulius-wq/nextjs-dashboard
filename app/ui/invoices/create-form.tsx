'use client';

import { CustomerField } from '@/app/lib/definitions';
import Link from 'next/link';
import {
  CheckIcon,
  ClockIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/app/ui/button';
import { useActionState, useState } from 'react';
import { createInvoice, type CreateInvoiceState } from '@/app/lib/actions';

export default function Form({
  customers,
  initialCustomerId,
}: {
  customers: CustomerField[];
  initialCustomerId?: string | null;
}) {
  const initialState: CreateInvoiceState | null = null;
  const [state, formAction] = useActionState(createInvoice, initialState);
  const [customerId, setCustomerId] = useState(initialCustomerId ?? '');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [dueDate, setDueDate] = useState('');
  return (
    <form action={formAction}>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:p-6">
        {/* Customer Name */}
        <div className="mb-4">
          <label htmlFor="customer" className="mb-2 block text-sm font-medium text-slate-200">
            Choose customer
          </label>
          <div className="relative">
            <select
              id="customer"
              name="customerId"
              className="peer block w-full cursor-pointer rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              aria-describedby="customer-error"
            >
              <option value="" disabled>
                Select a customer
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <UserCircleIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-sky-300" />
          </div>
          <div id="customer-error" aria-live="polite" aria-atomic="true">
            {state?.ok === false &&
              state.errors?.customerId &&
              state.errors.customerId.map((error: string) => (
                <p className="mt-2 text-sm text-red-500" key={error}>
                  {error}
                </p>
              ))}
          </div>
        </div>

        {/* Invoice Amount */}
        <div className="mb-4">
          <label htmlFor="amount" className="mb-2 block text-sm font-medium text-slate-200">
            Choose an amount
          </label>
          <div className="relative mt-2 rounded-md">
            <div className="relative">
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                placeholder="Enter amount in EUR"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="peer block w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
                aria-describedby="amount-error"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500 transition peer-focus:text-sky-300">
                €
              </span>
            </div>
            <div id="amount-error" aria-live="polite" aria-atomic="true">
              {state?.ok === false &&
                state.errors?.amount &&
                state.errors.amount.map((error: string) => (
                  <p className="mt-2 text-sm text-red-500" key={error}>
                    {error}
                  </p>
                ))}
            </div>
          </div>
        </div>

        {/* Invoice Status */}
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-slate-200">
            Set the invoice status
          </legend>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-[14px] py-3">
            <div className="flex gap-4">
              <div className="flex items-center">
                <input
                  id="pending"
                  name="status"
                  type="radio"
                  value="pending"
                  checked={status === 'pending'}
                  onChange={(event) => setStatus(event.target.value)}
                  className="h-4 w-4 cursor-pointer border-slate-700 bg-slate-900 text-slate-200 focus:ring-2 focus:ring-sky-400"
                  aria-describedby="status-error"
                />
                <label
                  htmlFor="pending"
                  className="ml-2 flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200"
                >
                  Pending <ClockIcon className="h-4 w-4" />
                </label>
              </div>
              <div className="flex items-center">
                <input
                  id="paid"
                  name="status"
                  type="radio"
                  value="paid"
                  checked={status === 'paid'}
                  onChange={(event) => setStatus(event.target.value)}
                  className="h-4 w-4 cursor-pointer border-slate-700 bg-slate-900 text-slate-200 focus:ring-2 focus:ring-sky-400"
                />
                <label
                  htmlFor="paid"
                  className="ml-2 flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-100"
                >
                  Paid <CheckIcon className="h-4 w-4" />
                </label>
              </div>
            </div>
          </div>
          <div id="status-error" aria-live="polite" aria-atomic="true">
              {state?.ok === false &&
                state.errors?.status &&
                state.errors.status.map((error: string) => (
                  <p className="mt-2 text-sm text-red-500" key={error}>
                    {error}
                  </p>
                ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <label htmlFor="dueDate" className="mb-2 block text-sm font-medium text-slate-200">
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="block w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/40"
            aria-describedby="dueDate-error"
          />
          <div id="dueDate-error" aria-live="polite" aria-atomic="true">
            {state?.ok === false &&
              state.errors?.dueDate &&
              state.errors.dueDate.map((error: string) => (
                <p className="mt-2 text-sm text-red-500" key={error}>
                  {error}
                </p>
              ))}
          </div>
        </div>
        {state?.ok === false && state.code === 'LIMIT_REACHED' && (
          <div className="mt-4 rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-amber-100">
            <p className="text-sm">{state.message}</p>
            <a
              className="mt-2 inline-flex items-center rounded-xl border border-amber-300/40 px-3 py-2 text-sm font-medium text-amber-100 transition duration-200 ease-out hover:bg-amber-500/10 hover:scale-[1.01]"
              href="/dashboard/settings"
            >
              View plans
            </a>
          </div>
        )}
        {state?.ok === false && state.code !== 'LIMIT_REACHED' && (
          <p className="mt-4 text-sm text-red-500" aria-live="polite">
            {state.message}
          </p>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-4">
        <Link
          href="/dashboard/invoices"
          className="flex h-10 items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 text-sm font-medium text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01]"
        >
          Cancel
        </Link>
        <Button type="submit">Create Invoice</Button>
      </div>
    </form>
  );
}
