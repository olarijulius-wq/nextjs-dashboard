'use client';

import { CustomerField, InvoiceForm } from '@/app/lib/definitions';
import {
  CheckIcon,
  ClockIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Button } from '@/app/ui/button';
import { updateInvoice, State } from '@/app/lib/actions';
import { useActionState, useState } from 'react';

export default function EditInvoiceForm({
  invoice,
  customers,
}: {
  invoice: InvoiceForm;
  customers: CustomerField[];
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
      <div className="rounded-md border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:p-6">
        {/* Customer Name */}
        <div className="mb-4">
          <label htmlFor="customer" className="mb-2 block text-sm font-medium text-slate-200">
            Choose customer
          </label>
          <div className="relative">
            <select
              id="customer"
              name="customerId"
              className="peer block w-full cursor-pointer rounded-md border border-slate-800 bg-slate-950/60 py-2 pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
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
            <UserCircleIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-sky-300" />
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
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Enter USD amount"
                className="peer block w-full rounded-md border border-slate-800 bg-slate-950/60 py-2 pl-10 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
              />
              <CurrencyDollarIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500 transition peer-focus:text-sky-300" />
            </div>
          </div>
        </div>

        {/* Invoice Status */}
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-slate-200">
            Set the invoice status
          </legend>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 px-[14px] py-3">
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
                  className="h-4 w-4 cursor-pointer border-slate-700 bg-slate-900 text-slate-200 focus:ring-2 focus:ring-sky-500"
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
                  onChange={(event) =>
                    setStatus(event.target.value as 'pending' | 'paid')
                  }
                  className="h-4 w-4 cursor-pointer border-slate-700 bg-slate-900 text-slate-200 focus:ring-2 focus:ring-sky-500"
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
            className="block w-full rounded-md border border-slate-800 bg-slate-950/60 py-2 pl-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
            aria-describedby="dueDate-error"
          />
          <div id="dueDate-error" aria-live="polite" aria-atomic="true">
            {state.errors?.dueDate?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-4">
        <Link
          href="/dashboard/invoices"
          className="flex h-10 items-center rounded-lg border border-slate-800 bg-slate-900 px-4 text-sm font-medium text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-800"
        >
          Cancel
        </Link>
        <Button type="submit">Edit Invoice</Button>
      </div>
    </form>
  );
}
