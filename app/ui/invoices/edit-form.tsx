'use client';

import { CustomerField, InvoiceForm } from '@/app/lib/definitions';
import {
  CheckIcon,
  ClockIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Button } from '@/app/ui/button';
import { updateInvoice, State } from '@/app/lib/actions';
import { useActionState, useState } from 'react';

const neutralSecondaryButtonClasses =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition duration-200 ease-out hover:bg-neutral-50 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-900 dark:focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50';

export default function EditInvoiceForm({
  invoice,
  customers,
  returnTo,
}: {
  invoice: InvoiceForm;
  customers: CustomerField[];
  returnTo?: string;
}) {
  const initialState: State = { message: null, errors: {} };
  const updateInvoiceWithId = updateInvoice.bind(null, invoice.id);
  const [state, formAction] = useActionState(updateInvoiceWithId, initialState);
  const [customerId, setCustomerId] = useState(invoice.customer_id);
  const [amount, setAmount] = useState(String(invoice.amount));
  const [status, setStatus] = useState<'pending' | 'paid'>(invoice.status);
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '');
 
  return (
    <form action={formAction}>
      <input type="hidden" name="returnTo" value={returnTo ?? ''} />
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] md:p-6 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        {/* Customer Name */}
        <div className="mb-4">
          <label htmlFor="customer" className="mb-2 block text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Choose customer
          </label>
          <div className="relative">
            <select
              id="customer"
              name="customerId"
              className="peer block w-full cursor-pointer rounded-xl border border-neutral-300 bg-white py-2 pl-10 text-sm text-neutral-900 outline-none placeholder:text-neutral-500 transition focus:border-neutral-800 focus:ring-2 focus:ring-neutral-500/30 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-700 dark:focus:ring-neutral-500/40"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
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
            <UserCircleIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-500 transition peer-focus:text-neutral-800 dark:peer-focus:text-neutral-300" />
          </div>
        </div>

        {/* Invoice Amount */}
        <div className="mb-4">
          <label htmlFor="amount" className="mb-2 block text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Choose an amount
          </label>
          <div className="relative mt-2 rounded-md">
            <div className="relative">
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Enter amount in EUR"
                className="peer block w-full rounded-xl border border-neutral-300 bg-white py-2 pl-10 text-sm text-neutral-900 outline-none placeholder:text-neutral-500 transition focus:border-neutral-800 focus:ring-2 focus:ring-neutral-500/30 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-700 dark:focus:ring-neutral-500/40"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-500 transition peer-focus:text-neutral-800 dark:peer-focus:text-neutral-300">
                €
              </span>
            </div>
          </div>
        </div>

        {/* Invoice Status */}
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Set the invoice status
          </legend>
          <div className="rounded-xl border border-neutral-300 bg-neutral-50 px-[14px] py-3 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex gap-4">
              <div className="flex items-center">
                <input
                  id="pending"
                  name="status"
                  type="radio"
                  value="pending"
                  checked={status === 'pending'}
                  onChange={(event) =>
                    setStatus(event.target.value as 'pending' | 'paid')
                  }
                  className="h-4 w-4 cursor-pointer border-neutral-400 bg-white text-black accent-black focus:ring-2 focus:ring-neutral-500/30 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:accent-neutral-100 dark:focus:ring-neutral-500/40"
                />
                <label
                  htmlFor="pending"
                  className="ml-2 flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-300 bg-amber-200 px-3 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200"
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
                  onChange={(event) =>
                    setStatus(event.target.value as 'pending' | 'paid')
                  }
                  className="h-4 w-4 cursor-pointer border-neutral-400 bg-white text-black accent-black focus:ring-2 focus:ring-neutral-500/30 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:accent-neutral-100 dark:focus:ring-neutral-500/40"
                />
                <label
                  htmlFor="paid"
                  className="ml-2 flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-100"
                >
                  Paid <CheckIcon className="h-4 w-4" />
                </label>
              </div>
            </div>
          </div>
        </fieldset>
        <div className="mt-4">
          <label htmlFor="dueDate" className="mb-2 block text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="block w-full rounded-xl border border-neutral-300 bg-white py-2 pl-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-500 transition focus:border-neutral-800 focus:ring-2 focus:ring-neutral-500/30 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-700 dark:focus:ring-neutral-500/40"
            aria-describedby="dueDate-error"
          />
          <div id="dueDate-error" aria-live="polite" aria-atomic="true">
            {state.errors?.dueDate?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
            {!dueDate ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                Warning: leaving due date empty keeps this invoice without a due date.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-4">
        <Link
          href="/dashboard/invoices"
          className={neutralSecondaryButtonClasses}
        >
          Cancel
        </Link>
        <Button type="submit">Edit Invoice</Button>
      </div>
    </form>
  );
}
