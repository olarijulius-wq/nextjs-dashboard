import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { deleteInvoice } from '@/app/lib/actions';

export function CreateInvoice() {
  return (
    <Link
      href="/dashboard/invoices/create"
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/80 px-4 text-sm font-medium text-slate-950 transition duration-200 ease-out hover:bg-sky-400/90 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <span className="hidden md:block">Create Invoice</span>{' '}
      <PlusIcon className="h-5 md:ml-4" />
    </Link>
  );
}

export function UpdateInvoice({ id }: { id: string }) {
  return (
    <Link
      href={`/dashboard/invoices/${id}/edit`}
      className="rounded-xl border border-slate-700 bg-slate-900/60 p-2 text-slate-200 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.02]"
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
        className="rounded-xl border border-slate-700 bg-slate-900/60 p-2 text-slate-200 transition duration-200 ease-out hover:border-rose-400/70 hover:bg-rose-500/10 hover:text-rose-200 hover:scale-[1.02]"
      >
        <span className="sr-only">Delete</span>
        <TrashIcon className="w-5" />
      </button>
    </form>
  );
}
