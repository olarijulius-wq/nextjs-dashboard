import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { deleteCustomer } from '@/app/lib/actions';

export function UpdateCustomer({ id }: { id: string }) {
  return (
    <Link
      href={`/dashboard/customers/${id}/edit`}
      className="rounded-xl border border-slate-700 bg-slate-900/60 p-2 text-slate-200 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.02]"
    >
      <PencilIcon className="w-5" />
    </Link>
  );
}

export function DeleteCustomer({ id }: { id: string }) {
  const deleteCustomerWithId = deleteCustomer.bind(null, id);
  return (
    <form action={deleteCustomerWithId}>
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
