'use client';

import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { deleteInvoice } from '@/app/lib/actions';
import { secondaryButtonClasses, toolbarButtonClasses } from '@/app/ui/button';

export function CreateInvoice() {
  return (
    <Link
      href="/dashboard/invoices/create"
      className={toolbarButtonClasses}
    >
      <span className="hidden md:block">Create Invoice</span>{' '}
      <PlusIcon className="h-5 md:ml-4" />
    </Link>
  );
}

export function UpdateInvoice({ id, returnTo }: { id: string; returnTo?: string }) {
  const href = returnTo
    ? `/dashboard/invoices/${id}/edit?returnTo=${encodeURIComponent(returnTo)}`
    : `/dashboard/invoices/${id}/edit`;

  return (
    <Link
      href={href}
      className={`${secondaryButtonClasses} h-9 px-2`}
    >
      <PencilIcon className="w-5" />
    </Link>
  );
}

export function DeleteInvoice({ id }: { id: string }) {
  const deleteInvoiceWithId = deleteInvoice.bind(null, id);
  return (
    <form action={deleteInvoiceWithId}>
      <button
        type="submit"
        className={`${secondaryButtonClasses} h-9 px-2`}
      >
        <span className="sr-only">Delete</span>
        <TrashIcon className="w-5" />
      </button>
    </form>
  );
}
